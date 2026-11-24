import assert from "node:assert/strict";
import test from "node:test";
import { require as requireTs } from "tsx/cjs/api";

const {
  DEEPSEEK_STORAGE_KEY,
  DeepSeekClientError,
  clearDeepSeekConfig,
  extractReferenceSearchTerms,
  parseDeepSeekConfig,
  maskApiKey,
  normalizeDeepSeekBaseUrl,
  normalizeDeepSeekChatUrl,
  parseDeepSeekEstimateContent,
  pruneForeignDeepSeekConfig,
  saveDeepSeekConfig,
  selectPersonalFoodContext,
  estimateNutritionWithDeepSeek,
  prefillFoodWithDeepSeek,
  testDeepSeekConnection,
} = requireTs("../src/lib/deepseek-client.ts", import.meta.url);
const { draftCommitPayload, makeEditableDraft, prefillUnchangedField, revisePendingDrafts } =
  requireTs("../src/lib/nutrition-drafts.ts", import.meta.url);

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

test("仅接受 DeepSeek 官方 HTTPS 接口并规范化补齐路径", () => {
  assert.equal(normalizeDeepSeekChatUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
  assert.equal(normalizeDeepSeekChatUrl("https://api.deepseek.com/"), "https://api.deepseek.com/chat/completions");
  assert.equal(normalizeDeepSeekChatUrl("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(normalizeDeepSeekChatUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(normalizeDeepSeekChatUrl("https://api.deepseek.com/chat/completions"), "https://api.deepseek.com/chat/completions");
  assert.equal(normalizeDeepSeekBaseUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1");

  const rejected = [
    "",
    "http://api.deepseek.com",
    "https://proxy.example.com/v1",
    "https://api.deepseek.com.evil.com",
    "https://user:pass@api.deepseek.com",
    "https://api.deepseek.com?foo=1",
    "https://api.deepseek.com/custom/path",
    "https://api.deepseek.com:8443",
    "not-a-url",
  ];
  for (const url of rejected) {
    assert.throws(() => normalizeDeepSeekChatUrl(url), DeepSeekClientError, `应拒绝 ${url}`);
  }
});

test("本地存储按账号绑定，切账号和退出登录自动清除密钥", () => {
  const storage = createMemoryStorage();
  const saved = saveDeepSeekConfig(
    "user-a",
    { baseUrl: "https://api.deepseek.com/v1/", apiKey: "sk-1234567890abcdef", model: "deepseek-chat" },
    storage,
  );
  assert.equal(saved.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(maskApiKey(saved.apiKey), "sk-••••••cdef");

  // 同一账号可读回
  const read = user => parseDeepSeekConfig(user, storage.getItem(DEEPSEEK_STORAGE_KEY));
  const loadedA = read("user-a");
  assert.deepEqual(loadedA, saved);
  assert.equal(saved.model, "deepseek-flash");
  storage.setItem(DEEPSEEK_STORAGE_KEY, JSON.stringify({ ...saved, model: "deepseek-chat" }));
  assert.equal(read("user-a").model, "deepseek-flash");

  // 切换账号后未刷新的标签页不能使用或移除活动账号密钥。
  assert.equal(read("user-b"), null);
  assert.deepEqual(read("user-a"), saved);

  // pruneForeignDeepSeekConfig 同样会清除异账号残留
  saveDeepSeekConfig("user-a", { baseUrl: "https://api.deepseek.com", apiKey: "sk-abcdefghij" }, storage);
  pruneForeignDeepSeekConfig("user-c", storage);
  assert.equal(storage.getItem(DEEPSEEK_STORAGE_KEY), null);

  // 退出登录调用 clearDeepSeekConfig 清除本地密钥
  saveDeepSeekConfig("user-a", { baseUrl: "https://api.deepseek.com", apiKey: "sk-abcdefghij" }, storage);
  clearDeepSeekConfig(storage);
  assert.equal(storage.getItem(DEEPSEEK_STORAGE_KEY), null);

  // 读取损坏数据也没有副作用，由已确认的登录流程清理。
  storage.setItem(DEEPSEEK_STORAGE_KEY, "{broken json");
  assert.equal(read("user-a"), null);
  pruneForeignDeepSeekConfig("user-a", storage);
  assert.equal(storage.getItem(DEEPSEEK_STORAGE_KEY), null);
});

test("结构化响应解析校验个人库/参考库归属并防止模型编造 ID 或超界数值", () => {
  const myFoods = [
    { id: "food-egg", name: "水煮鸡蛋", calories: 144, protein: 13.3, carbs: 2.8, fat: 8.8, servingGrams: 50 },
  ];
  const referenceFoods = [
    { id: 1, foodCode: "01-1-101", name: "米饭（蒸，粳米）", calories: 116, protein: 2.6, carbs: 25.9, fat: 0.3 },
  ];

  const fencedPayload = [
    "```json",
    JSON.stringify({
      reply: "已按份量拆分估算。",
      items: [
        {
          name: "水煮鸡蛋",
          source: "personal",
          matchedFoodId: "food-egg",
          assumption: "2个",
          grams: 100,
          servingGrams: 50,
          // 即使模型写错数值，命中个人库时必须以个人库真实值为准
          per100g: { calories: 999, protein: 1, carbs: 1, fat: 1 },
          suggestSaveToLibrary: true,
        },
        {
          name: "米饭（蒸，粳米）",
          source: "reference",
          matchedReferenceCode: "01-1-101",
          assumption: "半碗",
          grams: 120,
          servingGrams: 150,
          per100g: { calories: 500, protein: 0, carbs: 0, fat: 0 },
          suggestSaveToLibrary: false,
        },
        {
          // 模型编造不存在的 personal foodId，必须安全降级为 ai 且清掉 matchedFoodId
          name: "番茄炒蛋",
          source: "personal",
          matchedFoodId: "fake-uuid",
          assumption: "家常少油",
          grams: 99999,
          servingGrams: 220,
          per100g: { calories: 5000, protein: -5, carbs: 4.5, fat: 7.4 },
          suggestSaveToLibrary: false,
        },
      ],
      quickReplies: ["只吃了一半", "少油", "只吃了一半"],
    }),
    "```",
  ].join("\n");

  const result = parseDeepSeekEstimateContent(fencedPayload, { myFoods, referenceFoods });
  assert.equal(result.items.length, 3);

  assert.equal(result.items[0].source, "personal");
  assert.equal(result.items[0].matchedFoodId, "food-egg");
  assert.equal(result.items[0].per100g.calories, 144);
  assert.equal(result.items[0].suggestSaveToLibrary, false);

  assert.equal(result.items[1].source, "reference");
  assert.equal(result.items[1].matchedReferenceCode, "01-1-101");
  assert.equal(result.items[1].per100g.calories, 116);

  assert.equal(result.items[2].source, "ai");
  assert.equal(result.items[2].matchedFoodId, null);
  assert.equal(result.items[2].grams, 5000);
  assert.equal(result.items[2].per100g.calories, 2000);
  assert.equal(result.items[2].per100g.protein, 0);

  // quickReplies 去重
  assert.deepEqual(result.quickReplies, ["只吃了一半", "少油"]);

  // 非法或空 items 拒绝
  assert.throws(() => parseDeepSeekEstimateContent("not json"), DeepSeekClientError);
  assert.throws(() => parseDeepSeekEstimateContent('{"reply":"hi","items":[]}'), DeepSeekClientError);
});

test("关键词提取与个人库上下文筛选稳定有效", () => {
  const terms = extractReferenceSearchTerms("午饭吃了半碗米饭、一盘番茄炒蛋和2个水煮蛋");
  assert.ok(terms.length >= 1 && terms.length <= 3);

  const foods = Array.from({ length: 25 }, (_, i) => ({
    id: `f-${i}`,
    name: i === 22 ? "水煮鸡蛋" : `常见食物${i}`,
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    servingGrams: 100,
  }));
  const ctx = selectPersonalFoodContext("早上吃了2个水煮鸡蛋", foods);
  assert.equal(ctx.length, 1);
  assert.equal(ctx[0].id, "f-22");
  assert.deepEqual(selectPersonalFoodContext("完全无关", foods), []);
  assert.deepEqual(selectPersonalFoodContext(" ", foods), []);
});

const config = { userId: "test", baseUrl: "https://api.deepseek.com", apiKey: "test-only", model: "deepseek-flash" };
const macros = { calories: 120, protein: 7, carbs: 10, fat: 4 };
const egg = { id: "egg", name: "鸡蛋", ...macros, servingGrams: 50 };
const modelItem = { name: "鸡蛋", source: "personal", matchedFoodId: "egg", grams: 100, per100g: macros };

test("探测使用现行非思考模型，截断的推理响应说明连接成功，401 仍失败", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    return Response.json({ choices: [{ message: { content: "", reasoning_content: "test" }, finish_reason: "length" }] });
  });
  assert.equal((await testDeepSeekConnection({ ...config, model: "" })).model, "deepseek-flash");
  fetch.mock.mockImplementation(async () => new Response(null, { status: 401 }));
  await assert.rejects(testDeepSeekConnection(config), { code: "auth" });
});

test("个人库命中也先搜索，把网页摘要交给 JSON 估算，只发送相关个人食物", async t => {
  const other = { ...egg, id: "not-for-sharing", name: "私人无关菜品" };
  const page = { title: "营养标签", url: "https://example.org/label", summary: "每份 50g 含 60 kcal", snippet: "标签摘要" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(url);
    const body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer test-only");
    if (url.endsWith("/tools/search")) {
      assert.deepEqual(body, { query: "鸡蛋 100g 营养成分 热量", count: 3 });
      return Response.json({ results: [page] });
    }
    const system = body.messages[0].content;
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(JSON.parse(body.messages.at(-1).content).webSearchResults, [
      { title: page.title, url: page.url, summary: page.summary },
    ]);
    assert.ok(system.includes('"id":"egg"'));
    assert.ok(!system.includes(other.id) && !system.includes(other.name));
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      items: [{ ...modelItem, name: other.name, matchedFoodId: other.id }],
    }) } }] });
  });
  const result = await estimateNutritionWithDeepSeek({ config, userMessage: "鸡蛋 100g", myFoods: [other, egg] });
  assert.deepEqual(calls, ["https://api.deepseek.com/v1/tools/search", "https://api.deepseek.com/chat/completions"]);
  assert.deepEqual(result.webSources, [{ title: page.title, url: page.url }]);
  assert.equal(result.items[0].source, "ai");
  assert.equal(result.items[0].matchedFoodId, null);
});

test("追问和品牌帮填各自搜索，零结果仍可估算并注明", async t => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/tools/search")) {
      queries.push(body.query);
      assert.ok(Array.from(body.query).length <= 128);
      return Response.json({ results: [] });
    }
    assert.deepEqual(JSON.parse(body.messages.at(-1).content).webSearchResults, []);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [modelItem] }) } }] });
  });
  const result = await estimateNutritionWithDeepSeek({ config, userMessage: "改成半份", previousDrafts: [{ ...modelItem, name: "牛肉面" }] });
  assert.deepEqual(result.webSources, []);
  const prefill = await prefillFoodWithDeepSeek({ config, brand: "合成品牌", foodName: "豆浆" + "🥛".repeat(140) });
  assert.match(prefill.assumption, /网页搜索无结果/);
  assert.equal(queries.length, 2);
  assert.equal(queries[0], "改成半份 牛肉面 营养成分 热量");
  assert.ok(queries[1].startsWith("合成品牌 豆浆🥛") && queries[1].isWellFormed());
});

test("搜索失败、返回异常或取消时不发起估算", async t => {
  const calls = [];
  const controller = new AbortController();
  const search = t.mock.method(globalThis, "fetch", async url => {
    calls.push(url);
    return new Response(null, { status: 429 });
  });
  await assert.rejects(prefillFoodWithDeepSeek({ config, foodName: "豆浆" }), { code: "api", status: 429, message: /网页搜索失败/ });
  search.mock.mockImplementation(async url => {
    calls.push(url);
    return Response.json({ error: "unexpected" });
  });
  await assert.rejects(estimateNutritionWithDeepSeek({ config, userMessage: "豆浆" }), { code: "parse" });
  search.mock.mockImplementation(async url => {
    calls.push(url);
    controller.abort();
    return Response.json({ results: [] });
  });
  await assert.rejects(estimateNutritionWithDeepSeek({ config, userMessage: "豆浆", signal: controller.signal }), { code: "aborted" });
  assert.deepEqual(calls, Array(3).fill("https://api.deepseek.com/v1/tools/search"));
});

test("名称或营养修改走快照，仅改份量继续复用个人库", () => {
  const draft = makeEditableDraft(modelItem, "a");
  assert.equal(draftCommitPayload({ ...draft, grams: 60 }, [egg]).matchedFoodId, egg.id);
  for (const edit of [{ name: "修改后的鸡蛋" }, { per100g: { ...macros, calories: 150 } }]) {
    const payload = draftCommitPayload({ ...draft, ...edit }, [egg]);
    assert.equal(payload.matchedFoodId, null);
    assert.equal(payload.saveToLibrary, false);
    assert.equal(payload.calories, edit.per100g?.calories ?? 120);
    assert.equal(payload.name, edit.name ?? "鸡蛋");
  }
});

test("追问保留已记项和已入库编号，新提议不默认勾选，拒绝错配编号", () => {
  const logged = { ...makeEditableDraft(modelItem, "logged"), loggedSummary: "已记入早餐" };
  const rice = { ...modelItem, name: "米饭", matchedFoodId: null, source: "ai" };
  const savedFood = { ...egg, id: "saved-rice", name: rice.name };
  const pending = { ...makeEditableDraft(rice, "pending"), savedFood, matchedFoodId: savedFood.id };
  const next = revisePendingDrafts([logged, pending], [
    { ...rice, grams: 50, previousDraftId: "pending" },
    { ...modelItem, grams: 80 },
    { ...rice, name: "豆浆" },
  ], () => "new");
  assert.equal(next[0], logged);
  assert.equal(next[1].grams, 50);
  assert.equal(next[1].localId, pending.localId);
  assert.equal(draftCommitPayload(next[1], []).matchedFoodId, savedFood.id);
  assert.equal(draftCommitPayload(next[1], []).saveToLibrary, false);
  assert.equal(next[2].selected, false);
  assert.throws(() => revisePendingDrafts(next, [{ ...rice, previousDraftId: "invented" }], () => "new"));
});

test("只改份量时沿用已核验的来源和数值，改配方时使用新基准", async t => {
  const previous = makeEditableDraft(modelItem, "local-egg");
  const unrelated = { ...egg, id: "private-food", name: "无关菜品" };
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(url);
    if (url.endsWith("/tools/search")) {
      assert.match(body.query, /鸡蛋/);
      return Response.json({ results: [] });
    }
    assert.ok(body.messages[0].content.includes('"id":"egg"'));
    assert.ok(!body.messages[0].content.includes(unrelated.id));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{
      ...modelItem, previousDraftId: previous.localId, grams: 50, source: "ai", matchedFoodId: null,
      per100g: { ...macros, calories: 211 },
    }] }) } }] });
  });
  const res = await estimateNutritionWithDeepSeek({
    config, userMessage: "只吃了一半", previousDrafts: [previous], myFoods: [egg, unrelated],
  });
  assert.equal(requests.length, 2);
  const merge = (old, result) => revisePendingDrafts([old], [result], () => assert.fail("不应新增"))[0];
  const revised = merge(previous, res.items[0]);
  assert.equal(revised.grams, 50);
  assert.equal(revised.localId, "local-egg");
  assert.equal(revised.source, "personal");
  assert.equal(draftCommitPayload(revised, [egg]).matchedFoodId, egg.id);
  assert.equal(revised.per100g.calories, 120);
  const ref = { ...previous, matchedFoodId: null, matchedReferenceCode: "ref-1", source: "reference" };
  assert.equal(merge(ref, res.items[0]).matchedReferenceCode, "ref-1");
  const changed = merge(previous, { ...res.items[0], basisChanged: true });
  assert.equal(changed.per100g.calories, 211);
  assert.equal(draftCommitPayload(changed, [egg]).matchedFoodId, null);
});

test("完整修订清单移除未吃的食物，允许移除全部待记项并保留已记项", () => {
  const logged = { ...makeEditableDraft(modelItem, "a"), loggedSummary: "已记入" };
  const pending = makeEditableDraft({ ...modelItem, name: "米饭" }, "b");
  const greens = makeEditableDraft({ ...modelItem, name: "青菜" }, "c");
  const kept = revisePendingDrafts([logged, pending, greens], [{ ...greens, previousDraftId: "c" }], () => assert.fail());
  assert.deepEqual(kept.filter(d => d.selected && !d.loggedSummary).map(d => d.name), ["青菜"]);
  const { items } = parseDeepSeekEstimateContent('{"items":[]}', { revising: true });
  assert.deepEqual(revisePendingDrafts(kept, items, () => assert.fail()), [logged]);
  assert.deepEqual(revisePendingDrafts([pending], items, () => assert.fail()), []);
});

test("缺失、空白、布尔值均不作为营养数值，显式零和数字字符串可用", () => {
  const parse = item => parseDeepSeekEstimateContent(JSON.stringify({ items: [item] })).items[0];
  for (const invalid of [undefined, null, "", "  ", true, false]) {
    for (const field of Object.keys(macros)) {
      assert.throws(() => parse({ ...modelItem, per100g: { ...macros, [field]: invalid } }), { code: "parse" });
    }
    assert.throws(() => parse({ ...modelItem, grams: invalid }), { code: "parse" });
  }
  const zero = parse({ ...modelItem, grams: "50", servingGrams: null, per100g: { calories: "0", protein: 0, carbs: 0, fat: 0 } });
  assert.equal(zero.grams, 50);
  assert.equal(zero.servingGrams, 50);
  assert.deepEqual(zero.per100g, { calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test("超长描述全文抽词后再搜索，网页摘要用于实际估算", async t => {
  const description = "用餐背景。".repeat(35) + "最后吃的是合成品牌花生司康。";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(url);
    const body = JSON.parse(init.body);
    if (calls.length === 1) {
      assert.equal(JSON.parse(body.messages.at(-1).content).description, description);
      return Response.json({ choices: [{ message: { content: '{"query":"合成品牌 花生司康"}' } }] });
    }
    if (url.endsWith("/tools/search")) {
      assert.equal(body.query, "合成品牌 花生司康 营养成分 热量");
      return Response.json({ results: [{ title: "司康", url: "https://example.org/scone", summary: "标签数据", snippet: "" }] });
    }
    const prompt = JSON.parse(body.messages.at(-1).content);
    assert.equal(prompt.description, description);
    assert.equal(prompt.webSearchResults[0].summary, "标签数据");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [modelItem] }) } }] });
  });
  await estimateNutritionWithDeepSeek({ config, userMessage: description });
  assert.deepEqual(calls.map(url => new URL(url).pathname), ["/chat/completions", "/v1/tools/search", "/chat/completions"]);
});

test("提取的搜索词缺失或超长时终止本轮估算", async t => {
  let response;
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: response } }] }));
  for (const invalid of ["not json", '{"query":" "}', JSON.stringify({ query: "🥛".repeat(128) })]) {
    response = invalid;
    await assert.rejects(estimateNutritionWithDeepSeek({ config, userMessage: "背景".repeat(100) }), { code: "parse" });
  }
  assert.equal(fetch.mock.callCount(), 3);
});

test("帮填按字段合并，保留等待时输入的标签值、零和手动清空的字段", () => {
  assert.equal(prefillUnchangedField("288", "", 120), "288");
  assert.equal(prefillUnchangedField("0", "18", 7), "0");
  assert.equal(prefillUnchangedField("", "80", 50), "");
  assert.equal(prefillUnchangedField("", "", 7.5), "7.5");
});
