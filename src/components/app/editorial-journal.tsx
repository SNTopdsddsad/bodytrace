"use client";

import { useEffect, useRef, useState } from "react";
import type { Food } from "@/db/schema";
import { OPEN_MODAL_EVENT, type EditorialModalName } from "@/lib/editorial-events";
import type { MeasurementDashboard } from "@/lib/measurements";
import type { MealType } from "@/lib/nutrition";
import type { BodyProfile } from "@/lib/profile";
import type { DaySummary } from "@/services/meals";
import type { RecordCounts } from "@/services/records";
import type { TrendPoint } from "@/services/trends";
import { EditorialBudgetCard } from "./editorial-budget-card";
import { EditorialFoodChest } from "./editorial-food-chest";
import { EditorialMealsStream } from "./editorial-meals-stream";
import { EditorialMeasurementsCard } from "./editorial-measurements-card";
import { EditorialModals } from "./editorial-modals";

type ModalName = Exclude<EditorialModalName, "auth"> | null;

export function EditorialJournal({
  date,
  today,
  daySummary,
  recentFoods,
  myFoods,
  measurementData,
  trends,
  profile,
  recordCounts,
  initialModal = null,
}: {
  date: string;
  today: string;
  daySummary: DaySummary;
  recentFoods: Food[];
  myFoods: Food[];
  measurementData: MeasurementDashboard;
  trends: TrendPoint[];
  profile: BodyProfile | null;
  recordCounts: RecordCounts;
  initialModal?: ModalName;
}) {
  const canRecord = date <= today;
  const [targetMeal, setTargetMeal] = useState<MealType>("lunch");
  const [activeModal, setActiveModal] = useState<ModalName>(initialModal);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const foodChestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOpenModal(event: Event) {
      const detail = (event as CustomEvent<EditorialModalName>).detail;
      if (detail === "trends" || detail === "library" || detail === "settings") {
        setActiveModal(detail);
      }
    }
    window.addEventListener(OPEN_MODAL_EVENT, handleOpenModal);
    return () => window.removeEventListener(OPEN_MODAL_EVENT, handleOpenModal);
  }, []);

  function handlePickMeal(mealType: MealType) {
    setTargetMeal(mealType);
    if (foodChestRef.current && window.innerWidth < 1280) {
      foodChestRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);
  }

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* 左栏 (3列)：今日热量预算 + 身体指标追踪 */}
        <aside className="space-y-5 lg:col-span-4 xl:col-span-3">
          <EditorialBudgetCard
            date={date}
            totals={daySummary.totals}
            goals={daySummary.goals}
            onEditGoals={() => setActiveModal("settings")}
          />
          <EditorialMeasurementsCard
            data={measurementData}
            selectedDate={date}
            onOpenSettings={() => setActiveModal("settings")}
          />
        </aside>

        {/* 中栏 (5列)：四餐饮食手账 */}
        <div className="min-w-0 lg:col-span-8 xl:col-span-5">
          <EditorialMealsStream
            date={date}
            canRecord={canRecord}
            byMeal={daySummary.byMeal}
            myFoods={myFoods}
            targetMeal={targetMeal}
            onPickMeal={handlePickMeal}
          />
        </div>

        {/* 右栏 (4列)：全高常驻食物百宝箱 */}
        <aside
          ref={foodChestRef}
          className="lg:col-span-12 xl:sticky xl:top-24 xl:col-span-4"
        >
          <EditorialFoodChest
            date={date}
            canRecord={canRecord}
            targetMeal={targetMeal}
            onTargetMealChange={setTargetMeal}
            recentFoods={recentFoods}
            myFoods={myFoods}
            searchInputRef={searchInputRef}
            onOpenLibrary={() => setActiveModal("library")}
          />
        </aside>
      </div>

      <EditorialModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        trends={trends}
        goals={daySummary.goals}
        profile={profile}
        measurementData={measurementData}
        myFoods={myFoods}
        recordCounts={recordCounts}
      />
    </>
  );
}
