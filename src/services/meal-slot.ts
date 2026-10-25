import { z } from "zod";
import { isValidDateStr, todayStr } from "@/lib/date";
import { MEAL_ORDER } from "@/lib/nutrition";

/** 食物记录与照片共用的业务日期、餐次校验。 */
export const mealSlotSchema = z.object({
  date: z.string()
    .refine(isValidDateStr, "日期格式应为 YYYY-MM-DD")
    .refine((date) => date <= todayStr(), "不能记录未来日期"),
  mealType: z.enum(MEAL_ORDER),
});
