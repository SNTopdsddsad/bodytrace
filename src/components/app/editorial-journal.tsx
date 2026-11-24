"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Food } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OPEN_MODAL_EVENT, type EditorialModalName } from "@/lib/editorial-events";
import type { BloodPressureHistory, MeasurementDashboard } from "@/lib/measurements";
import { MEAL_LABELS, type MealType } from "@/lib/nutrition";
import type { BodyProfile } from "@/lib/profile";
import type { DaySummary } from "@/services/meals";
import type { RecordCounts } from "@/services/records";
import type { TrendPoint } from "@/services/trends";
import { EditorialBudgetCard } from "./editorial-budget-card";
import { EditorialFoodChest, useFoodChestWrite } from "./editorial-food-chest";
import { EditorialMealsStream } from "./editorial-meals-stream";
import { EditorialMeasurementsCard } from "./editorial-measurements-card";
import { EditorialModals } from "./editorial-modals";
import { SOFT_SPRING } from "./motion-provider";

type ModalName = Exclude<EditorialModalName, "auth"> | null;

export function EditorialJournal({
  date,
  today,
  defaultMeal,
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
  defaultMeal: MealType;
  daySummary: DaySummary;
  recentFoods: Food[];
  myFoods: Food[];
  measurementData: MeasurementDashboard & { recentBloodPressure: BloodPressureHistory };
  trends: TrendPoint[];
  profile: BodyProfile | null;
  recordCounts: RecordCounts;
  initialModal?: ModalName;
}) {
  const canRecord = date <= today;
  const foodWrite = useFoodChestWrite();
  const [targetMeal, setTargetMeal] = useState<MealType>(defaultMeal);
  const [activeModal, setActiveModal] = useState<ModalName>(initialModal);
  const [mobileChestOpen, setMobileChestOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

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

  /** 全局快捷键：⌘K / Ctrl+K 或 / 快速聚焦食物百宝箱搜索框 */
  useEffect(() => {
    let pendingSlashFocus = false;

    function focusSearch() {
      if (document.getElementById("main-content")?.inert) return;
      if (window.innerWidth < 1280) {
        setMobileChestOpen(true);
        setTimeout(() => mobileSearchInputRef.current?.focus(), 120);
      } else {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (activeModal !== null) return;
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/" && !inInput;

      if (isCmdK) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (isSlash) {
        // keydown 阻止默认查找行为，等到 keyup 再聚焦，避免 "/" 字符落入刚聚焦的搜索框
        e.preventDefault();
        if (!e.repeat) {
          pendingSlashFocus = true;
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (!pendingSlashFocus) return;
      if (e.key === "/" || e.code === "Slash") {
        pendingSlashFocus = false;
        if (activeModal === null) {
          focusSearch();
        }
      }
    }

    function cancelPendingSlash() {
      pendingSlashFocus = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", cancelPendingSlash);
    window.addEventListener("pointerdown", cancelPendingSlash);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", cancelPendingSlash);
      window.removeEventListener("pointerdown", cancelPendingSlash);
    };
  }, [activeModal]);

  function handlePickMeal(mealType: MealType) {
    setTargetMeal(mealType);
    if (window.innerWidth < 1280) {
      setMobileChestOpen(true);
      setTimeout(() => mobileSearchInputRef.current?.focus(), 120);
      return;
    }
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
  }

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* 左栏 (3列)：今日热量预算 + 身体指标追踪 */}
        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SOFT_SPRING, delay: 0 }}
          className="space-y-5 lg:col-span-4 xl:col-span-3"
        >
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
        </motion.aside>

        {/* 中栏 (5列)：四餐饮食手账 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SOFT_SPRING, delay: 0.04 }}
          className="min-w-0 lg:col-span-8 xl:col-span-5"
        >
          <EditorialMealsStream
            date={date}
            canRecord={canRecord}
            byMeal={daySummary.byMeal}
            myFoods={myFoods}
            targetMeal={targetMeal}
            onPickMeal={handlePickMeal}
          />
        </motion.div>

        {/* 右栏 (4列)：大屏常驻食物百宝箱（中/小屏通过点 + 记食物弹出浮层，避免超长滚动） */}
        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SOFT_SPRING, delay: 0.08 }}
          className="hidden xl:sticky xl:top-24 xl:col-span-4 xl:block"
        >
          <EditorialFoodChest
            write={foodWrite}
            date={date}
            canRecord={canRecord}
            targetMeal={targetMeal}
            onTargetMealChange={setTargetMeal}
            recentFoods={recentFoods}
            myFoods={myFoods}
            searchInputRef={searchInputRef}
            onOpenLibrary={() => setActiveModal("library")}
            scope="desktop"
          />
        </motion.aside>
      </div>

      {/* 移动端 / 平板端（< xl）食物百宝箱快捷浮层 */}
      <Dialog open={mobileChestOpen} onOpenChange={setMobileChestOpen}>
        <DialogContent className="max-h-[88svh] overflow-y-auto rounded-3xl p-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>记入{MEAL_LABELS[targetMeal]}</DialogTitle>
            <DialogDescription>
              点击食物胶囊一键记入，或检索《中国食物成分表》自动转存。
            </DialogDescription>
          </DialogHeader>
          <EditorialFoodChest
            write={foodWrite}
            date={date}
            canRecord={canRecord}
            targetMeal={targetMeal}
            onTargetMealChange={setTargetMeal}
            recentFoods={recentFoods}
            myFoods={myFoods}
            searchInputRef={mobileSearchInputRef}
            onOpenLibrary={() => {
              setMobileChestOpen(false);
              setActiveModal("library");
            }}
            scope="mobile"
            embedded
          />
        </DialogContent>
      </Dialog>

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
