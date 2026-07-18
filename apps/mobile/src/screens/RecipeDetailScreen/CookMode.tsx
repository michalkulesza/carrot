import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetModalProvider, BottomSheetScrollView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import * as KeepAwake from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { RecipeOut } from "@carrot/shared/types";
import { displayIngredient } from "@carrot/shared/utils/ingredientUtils";
import { parseDurationMatches } from "@carrot/shared/utils/timerUtils";
import {
  formatCountdown,
  formatDurationLabel,
  getRemainingSeconds,
  useTimers,
} from "../../context/TimerContext";

const KEEP_AWAKE_COOK_TAG = "cook-mode";
const FONT_SCALE_STORAGE_KEY = "cook-mode-font-scale";
const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.35;
const FONT_SCALE_STEP = 0.1;

const CookMode = ({
  recipe,
  visible,
  onClose,
  colorScheme,
}: {
  recipe: RecipeOut;
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark";
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === "dark";
  const bg = dark ? "#20211f" : "#f7f5f0";
  const text = dark ? "#f4f1eb" : "#252421";
  const muted = dark ? "#aaa9a3" : "#74716b";
  const steps = useMemo(
    () =>
      recipe.components.flatMap((component, componentIndex) =>
        component.steps.map((text, stepIndex) => ({
          componentIndex,
          stepIndex,
          text,
          ingredients: [
            ...new Set(
              (component.step_ingredient_refs?.[stepIndex] ?? []).map((ref) =>
                displayIngredient(
                  component.ingredients[ref.ingredient_index] ?? "",
                ),
              ),
            ),
          ],
        })),
      ),
    [recipe],
  );
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [instructionFontSize, setInstructionFontSize] = useState(39);
  const [instructionReady, setInstructionReady] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [mainHeight, setMainHeight] = useState(0);
  const [, setTimerTick] = useState(0);
  const ingredientsSheetRef = useRef<BottomSheetModal>(null);
  const stepContentOpacity = useRef(new Animated.Value(0)).current;
  const swipeStart = useRef<number | null>(null);
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers();
  const step = steps[index];
  const durations = useMemo(
    () => (step ? parseDurationMatches(step.text) : []),
    [step],
  );
  const storageKey = `cook-mode:${recipe.id}`;

  useEffect(() => {
    if (!visible) return;
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (!value) return;
      try {
        const saved = JSON.parse(value) as {
          index?: number;
          checked?: string[];
        };
        setIndex(Math.min(saved.index ?? 0, Math.max(0, steps.length - 1)));
        setChecked(new Set(saved.checked ?? []));
      } catch {}
    });
    void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_COOK_TAG);
    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_COOK_TAG);
    };
  }, [visible, storageKey, steps.length]);
  useEffect(() => {
    void AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY).then((value) => {
      const savedScale = Number(value);
      if (savedScale >= MIN_FONT_SCALE && savedScale <= MAX_FONT_SCALE) {
        setFontScale(savedScale);
      }
    });
  }, []);
  useEffect(() => {
    if (visible)
      void AsyncStorage.setItem(
        storageKey,
        JSON.stringify({ index, checked: [...checked] }),
      );
  }, [visible, storageKey, index, checked]);
  useEffect(() => {
    if (!visible || ![...timers.values()].some((timer) => timer.status === "running")) return;
    const timer = setInterval(() => setTimerTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [visible, timers]);
  useLayoutEffect(() => {
    setInstructionFontSize(Math.round(39 * fontScale));
    setInstructionReady(false);
  }, [fontScale, index, step?.text]);
  useEffect(() => {
    if (!instructionReady) {
      stepContentOpacity.setValue(0);
      return;
    }
    Animated.timing(stepContentOpacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [instructionReady, stepContentOpacity]);
  useEffect(() => {
    if (ingredientsOpen) ingredientsSheetRef.current?.present();
    else ingredientsSheetRef.current?.dismiss();
  }, [ingredientsOpen]);
  if (!step) return null;
  const allIngredients = recipe.components.flatMap(
    (component, componentIndex) =>
      component.ingredients.map((ingredient, ingredientIndex) => ({
        key: `${componentIndex}-${ingredientIndex}`,
        text: displayIngredient(ingredient),
      })),
  );
  const go = (next: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, next));
    if (target === index) return;
    Animated.timing(stepContentOpacity, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIndex(target);
    });
  };
  const adjustFontScale = (delta: number) => {
    const next = Math.min(
      MAX_FONT_SCALE,
      Math.max(MIN_FONT_SCALE, Number((fontScale + delta).toFixed(2))),
    );
    if (next === fontScale) return;
    Animated.timing(stepContentOpacity, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setFontScale(next);
      void AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next));
    });
  };
  const renderIngredientsBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
    <BottomSheetModalProvider>
    <StatusBar style={dark ? "light" : "dark"} animated />
    <View
      style={[
        styles.root,
        {
          backgroundColor: bg,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: Math.max(18, insets.top + 10),
          paddingBottom: Math.max(24, insets.bottom + 12),
        }}
      >
        <View style={styles.header}>
          <Text numberOfLines={1} style={[styles.recipeTitle, { color: text }]}>
            {recipe.title}
          </Text>
          <View style={styles.fontControls}>
            <Pressable
              disabled={fontScale <= MIN_FONT_SCALE}
              onPress={() => adjustFontScale(-FONT_SCALE_STEP)}
              style={({ pressed }) => [
                styles.fontControl,
                pressed && { opacity: 0.55 },
                fontScale <= MIN_FONT_SCALE && styles.fontControlDisabled,
              ]}
              accessibilityLabel={t("cookMode.decreaseTextSize")}
            >
              <Text style={[styles.fontControlSmall, { color: muted }]}>aA</Text>
            </Pressable>
            <Pressable
              disabled={fontScale >= MAX_FONT_SCALE}
              onPress={() => adjustFontScale(FONT_SCALE_STEP)}
              style={({ pressed }) => [
                styles.fontControl,
                pressed && { opacity: 0.55 },
                fontScale >= MAX_FONT_SCALE && styles.fontControlDisabled,
              ]}
              accessibilityLabel={t("cookMode.increaseTextSize")}
            >
              <Text style={[styles.fontControlLarge, { color: muted }]}>aA</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setIngredientsOpen(true)}
            hitSlop={12}
            accessibilityLabel="Ingredients"
          >
            <Ionicons name="list-outline" size={27} color={muted} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close cook mode"
          >
            <Ionicons name="close" size={31} color={muted} />
          </Pressable>
        </View>
        <View style={styles.progress}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressItem,
                {
                  backgroundColor:
                    i <= index ? text : dark ? "#545550" : "#d5d1c9",
                },
              ]}
            />
          ))}
        </View>
        <View
          style={styles.main}
          onLayout={(event) => setMainHeight(event.nativeEvent.layout.height)}
          onTouchStart={(event) => {
            swipeStart.current = event.nativeEvent.touches[0]?.pageX ?? null;
          }}
          onTouchEnd={(event) => {
            if (swipeStart.current === null) return;
            const delta =
              (event.nativeEvent.changedTouches[0]?.pageX ?? swipeStart.current) -
              swipeStart.current;
            if (Math.abs(delta) > 70) go(index + (delta < 0 ? 1 : -1));
            swipeStart.current = null;
          }}
        >
          <Text style={[styles.stepLabel, { color: muted }]}>
            STEP {index + 1}
          </Text>
          <Animated.Text
            key={`${index}-${mainHeight}-${instructionFontSize}`}
            style={[
              styles.instruction,
              {
                color: text,
                fontSize: instructionFontSize,
                lineHeight: Math.round(instructionFontSize * 1.23),
                opacity: stepContentOpacity,
              },
            ]}
            maxFontSizeMultiplier={1}
            onTextLayout={(event) => {
              const instructionHeight =
                event.nativeEvent.lines.length * Math.round(instructionFontSize * 1.23);
              const reservedHeight =
                62 +
                (step.ingredients.length > 0 ? 42 : 0) +
                (durations.length > 0 ? 72 : 0);
              if (
                mainHeight > 0 &&
                instructionHeight > mainHeight - reservedHeight &&
                instructionFontSize > 22
              ) {
                setInstructionFontSize((size) => Math.max(22, size - 2));
              } else if (mainHeight > 0) {
                setInstructionReady(true);
              }
            }}
          >
            {step.text}
          </Animated.Text>
          {step.ingredients.length > 0 && (
            <Animated.Text
              style={[
                styles.stepIngredients,
                { color: muted, opacity: stepContentOpacity },
              ]}
            >
              {step.ingredients.join(" · ")}
            </Animated.Text>
          )}
          <Animated.View style={{ opacity: stepContentOpacity }}>
            <View style={styles.timerGrid}>
              {durations.map((duration, durationIndex) => {
              const id = `${recipe.id}-c${step.componentIndex}-s${step.stepIndex}-d${durationIndex}`;
              const timer = timers.get(id);
              const remaining = timer
                ? getRemainingSeconds(timer)
                : duration.seconds;
              const running = timer?.status === "running";
              const done = timer?.status === "done" || remaining === 0;
              return (
                <Pressable
                  key={id}
                  onPress={() =>
                    !timer
                      ? startTimer({
                          id,
                          recipeId: recipe.id,
                          recipeTitle: recipe.title,
                          componentIndex: step.componentIndex,
                          stepIndex: step.stepIndex,
                          stepText: step.text,
                          totalSeconds: duration.seconds,
                        })
                      : !done && (running ? pauseTimer(id) : resumeTimer(id))
                  }
                  style={styles.timerRow}
                >
                  <View style={styles.timerControl}>
                    <Ionicons
                      name={done ? "checkmark" : running ? "pause" : "play"}
                      size={25}
                      color={done ? "#ea8e4e" : text}
                    />
                  </View>
                  <Text style={[styles.timerTime, { color: text }]}>
                    {timer
                      ? formatCountdown(remaining)
                      : formatDurationLabel(duration.seconds)}
                  </Text>
                </Pressable>
              );
              })}
            </View>
          </Animated.View>
        </View>
        <View style={styles.footer}>
          <Pressable
            disabled={index === 0}
            onPress={() => go(index - 1)}
            style={[
              styles.navButton,
              {
                backgroundColor: dark ? "#30312e" : "#e9e5dd",
                opacity: index === 0 ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={28} color={text} />
          </Pressable>
          <Text style={[styles.count, { color: text }]}>
            {index + 1} of {steps.length}
          </Text>
          <Pressable
            disabled={index === steps.length - 1}
            onPress={() => go(index + 1)}
            style={[
              styles.navButton,
              {
                backgroundColor: text,
                opacity: index === steps.length - 1 ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-forward" size={28} color={bg} />
          </Pressable>
        </View>
      </View>
        <BottomSheetModal
          ref={ingredientsSheetRef}
          snapPoints={["70%"]}
          enableDynamicSizing={false}
          enablePanDownToClose
          onDismiss={() => setIngredientsOpen(false)}
          backdropComponent={renderIngredientsBackdrop}
          backgroundStyle={{ backgroundColor: dark ? "#2b2d2a" : "#eeece7" }}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={[styles.sheet, { paddingBottom: 22 + insets.bottom }]}> 
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: text }]}>Ingredients</Text>
            </View>
            <BottomSheetScrollView style={styles.ingredientScroll}>
                {allIngredients.map((ingredient) => (
                  <Pressable
                    key={ingredient.key}
                    onPress={() =>
                      setChecked((current) => {
                        const next = new Set(current);
                        next.has(ingredient.key)
                          ? next.delete(ingredient.key)
                          : next.add(ingredient.key);
                        return next;
                      })
                    }
                    style={styles.ingredientRow}
                  >
                    <Ionicons
                      name={
                        checked.has(ingredient.key)
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={24}
                      color={checked.has(ingredient.key) ? "#ea8e4e" : muted}
                    />
                    <Text
                      style={[
                        styles.ingredientText,
                        {
                          color: checked.has(ingredient.key) ? muted : text,
                          textDecorationLine: checked.has(ingredient.key)
                            ? "line-through"
                            : "none",
                        },
                      ]}
                    >
                      {ingredient.text}
                    </Text>
                  </Pressable>
                ))}
            </BottomSheetScrollView>
          </View>
        </BottomSheetModal>
      </View>
    </BottomSheetModalProvider>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 18 },
  recipeTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  fontControls: { flexDirection: "row", alignItems: "center", gap: 2 },
  fontControl: { minWidth: 28, minHeight: 44, alignItems: "center", justifyContent: "center" },
  fontControlDisabled: { opacity: 0.3 },
  fontControlSmall: { fontSize: 13, fontWeight: "600" },
  fontControlLarge: { fontSize: 18, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 5, marginTop: 28 },
  progressItem: { flex: 1, height: 4, borderRadius: 2 },
  main: { flex: 1, justifyContent: "center", alignItems: "center" },
  stepLabel: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 16,
  },
  instruction: {
    textAlign: "center",
    fontFamily: "Georgia",
  },
  stepIngredients: {
    textAlign: "center",
    fontSize: 16,
    marginTop: 22,
    lineHeight: 22,
  },
  timerGrid: { width: "100%", gap: 6, marginTop: 24 },
  timerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerControl: { width: 48, alignItems: "center", justifyContent: "center" },
  timerTime: { fontFamily: "Georgia", fontSize: 34 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { fontSize: 19, fontWeight: "700" },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#00000066",
  },
  backdropTapTarget: { flex: 1 },
  ingredientsOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  sheetAnimation: {
    position: "absolute",
    top: "30%",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetBottomFill: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 280,
  },
  sheet: {
    flex: 1,
    padding: 22,
  },
  sheetHandle: { backgroundColor: "#8e8e93" },
  ingredientScroll: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 22, fontWeight: "700" },
  ingredientRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  ingredientText: { flex: 1, fontSize: 17 },
});

export default CookMode;
