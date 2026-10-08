import { db } from "./index";
import { food } from "./schema";

/**
 * 新用户注册后预置的常见食物（每 100g 营养值，公开数据的大致均值，
 * 用户可在食物库里自行修改）。
 */
const COMMON_FOODS = [
  { name: "米饭（熟）", calories: 116, protein: 2.6, carbs: 25.9, fat: 0.3, servingGrams: 200 },
  { name: "糙米饭（熟）", calories: 112, protein: 2.6, carbs: 23.5, fat: 0.9, servingGrams: 200 },
  { name: "馒头", calories: 223, protein: 7.0, carbs: 47.0, fat: 1.1, servingGrams: 100 },
  { name: "面条（熟）", calories: 110, protein: 3.9, carbs: 22.0, fat: 0.4, servingGrams: 250 },
  { name: "全麦面包", calories: 246, protein: 10.0, carbs: 45.0, fat: 3.4, servingGrams: 35 },
  { name: "燕麦片（干）", calories: 367, protein: 15.0, carbs: 61.0, fat: 7.0, servingGrams: 40 },
  { name: "红薯（熟）", calories: 90, protein: 2.0, carbs: 20.7, fat: 0.2, servingGrams: 150 },
  { name: "土豆", calories: 77, protein: 2.0, carbs: 17.0, fat: 0.2, servingGrams: 150 },
  { name: "鸡胸肉（生）", calories: 133, protein: 24.0, carbs: 0, fat: 2.5, servingGrams: 150 },
  { name: "鸡蛋（全蛋）", calories: 139, protein: 13.3, carbs: 2.8, fat: 8.8, servingGrams: 50 },
  { name: "鸡蛋清", calories: 60, protein: 11.6, carbs: 3.1, fat: 0.2, servingGrams: 33 },
  { name: "牛奶", calories: 54, protein: 3.0, carbs: 3.4, fat: 3.2, servingGrams: 250 },
  { name: "无糖酸奶", calories: 62, protein: 5.0, carbs: 5.0, fat: 3.3, servingGrams: 150 },
  { name: "乳清蛋白粉", calories: 380, protein: 80.0, carbs: 8.0, fat: 6.0, servingGrams: 30 },
  { name: "牛瘦肉（生）", calories: 143, protein: 21.0, carbs: 1.2, fat: 6.0, servingGrams: 150 },
  { name: "猪里脊（生）", calories: 155, protein: 20.2, carbs: 0.7, fat: 7.9, servingGrams: 150 },
  { name: "三文鱼（生）", calories: 208, protein: 20.4, carbs: 0, fat: 13.4, servingGrams: 150 },
  { name: "虾（生）", calories: 93, protein: 20.3, carbs: 0.2, fat: 0.9, servingGrams: 100 },
  { name: "豆腐", calories: 81, protein: 8.1, carbs: 1.9, fat: 4.8, servingGrams: 150 },
  { name: "西兰花", calories: 34, protein: 2.8, carbs: 4.3, fat: 0.6, servingGrams: 100 },
  { name: "香蕉", calories: 93, protein: 1.4, carbs: 22.0, fat: 0.2, servingGrams: 120 },
  { name: "苹果", calories: 53, protein: 0.2, carbs: 13.5, fat: 0.2, servingGrams: 180 },
  { name: "混合坚果", calories: 607, protein: 20.0, carbs: 20.0, fat: 52.0, servingGrams: 25 },
  { name: "橄榄油", calories: 884, protein: 0, carbs: 0, fat: 100, servingGrams: 10 },
];

export async function seedCommonFoods(userId: string) {
  await db.insert(food).values(
    COMMON_FOODS.map((f) => ({
      userId,
      name: f.name,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      servingGrams: f.servingGrams,
    })),
  );
}
