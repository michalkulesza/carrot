import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  DynamicColorIOS,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as KeepAwake from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "expo-router";
import type { RecipeOut } from "@carrot/shared/types";
import { parseDurationMatches } from "@carrot/shared/utils/timerUtils";
import {
  formatCountdown,
  formatDurationLabel,
  getRemainingSeconds,
  useTimers,
} from "../../context/TimerContext";
import { useIsAppActive } from "../../hooks/useIsAppActive";
import IngredientRail from "./IngredientRail";
import { buildIngredientRailRows, RAIL_VISIBLE_STORAGE_KEY, resolveRailTargets } from "./helpers";

const KEEP_AWAKE_COOK_TAG = "cook-mode";
const FONT_SCALE_STORAGE_KEY = "cook-mode-font-scale";
const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.35;
const FONT_SCALES = [MIN_FONT_SCALE, 1, MAX_FONT_SCALE];
const INSTRUCTION_HEIGHT_BUFFER = 24;

const getFontScaleIndex = (fontScale: number) => {
  const closestScale = FONT_SCALES.reduce((closest, scale) =>
    Math.abs(scale - fontScale) < Math.abs(closest - fontScale) ? scale : closest,
  );

  return FONT_SCALES.indexOf(closestScale);
};

const cookColor = (light: string, dark: string, colorScheme: "light" | "dark") =>
  (Platform.OS === "ios"
    ? DynamicColorIOS({ light, dark })
    : colorScheme === "dark"
      ? dark
      : light) as unknown as string;

const CookModeToolbar = ({
  canDecreaseTextSize,
  canIncreaseTextSize,
  onDecreaseTextSize,
  onIncreaseTextSize,
  railVisible,
  onToggleRail,
  onClose,
  muted,
  decreaseTextSizeLabel,
  increaseTextSizeLabel,
  toggleRailLabel,
  closeLabel,
}: {
  canDecreaseTextSize: boolean;
  canIncreaseTextSize: boolean;
  onDecreaseTextSize: () => void;
  onIncreaseTextSize: () => void;
  railVisible: boolean;
  onToggleRail: () => void;
  onClose: () => void;
  muted: string;
  decreaseTextSizeLabel: string;
  increaseTextSizeLabel: string;
  toggleRailLabel: string;
  closeLabel: string;
}) => (
  <View style={styles.toolbar}>
    <Pressable
      disabled={!canDecreaseTextSize}
      onPress={onDecreaseTextSize}
      style={({ pressed }) => [
        styles.toolbarButton,
        pressed && { opacity: 0.55 },
        !canDecreaseTextSize && styles.fontControlDisabled,
      ]}
      accessibilityLabel={decreaseTextSizeLabel}
    >
      <Text style={[styles.fontControlSmall, { color: muted }]}>aA</Text>
    </Pressable>
    <Pressable
      disabled={!canIncreaseTextSize}
      onPress={onIncreaseTextSize}
      style={({ pressed }) => [
        styles.toolbarButton,
        pressed && { opacity: 0.55 },
        !canIncreaseTextSize && styles.fontControlDisabled,
      ]}
      accessibilityLabel={increaseTextSizeLabel}
    >
      <Text style={[styles.fontControlLarge, { color: muted }]}>aA</Text>
    </Pressable>
    <Pressable
      onPress={onToggleRail}
      hitSlop={8}
      accessibilityLabel={toggleRailLabel}
      accessibilityState={{ selected: railVisible }}
      style={!railVisible && styles.fontControlDisabled}
    >
      <Ionicons name="list-outline" size={25} color={muted} />
    </Pressable>
    <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={closeLabel}>
      <Ionicons name="close" size={29} color={muted} />
    </Pressable>
  </View>
);

const CookModeBackButton = ({ onClose, muted, closeLabel }: { onClose: () => void; muted: string; closeLabel: string }) => (
  <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={closeLabel}>
    <Ionicons name="chevron-back" size={28} color={muted} />
  </Pressable>
)

const CookMode = ({
  recipe,
  visible,
  onClose,
  colorScheme,
  initialComponentIndex,
  initialStepIndex,
  selectedServings,
  unitSystem,
}: {
  recipe: RecipeOut;
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark";
  initialComponentIndex: number | null;
  initialStepIndex: number | null;
  selectedServings: number | null;
  unitSystem: string;
}) => {
  const isAppActive = useIsAppActive();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dark = colorScheme === "dark";
  const bg = cookColor("#f7f5f0", "#20211f", colorScheme);
  const bgHex = dark ? "#20211f" : "#f7f5f0";
  const text = cookColor("#252421", "#f4f1eb", colorScheme);
  const muted = cookColor("#74716b", "#aaa9a3", colorScheme);
  const inactiveProgress = cookColor("#d5d1c9", "#545550", colorScheme);
  const secondaryButton = cookColor("#e9e5dd", "#30312e", colorScheme);
  const steps = useMemo(
    () =>
      recipe.components.flatMap((component, componentIndex) =>
        component.steps.map((text, stepIndex) => ({
          componentIndex,
          stepIndex,
          text,
        })),
      ),
    [recipe],
  );
  const servingScale = recipe.servings && selectedServings ? selectedServings / recipe.servings : 1;
  const railRows = useMemo(
    () => buildIngredientRailRows(recipe.components, unitSystem, servingScale),
    [recipe.components, unitSystem, servingScale],
  );
  const railTargets = useMemo(() => resolveRailTargets(recipe.components), [recipe.components]);
  const [index, setIndex] = useState(0);
  const [instructionFontSize, setInstructionFontSize] = useState(39);
  const [instructionReady, setInstructionReady] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [instructionAreaHeight, setInstructionAreaHeight] = useState(0);
  const [labelHeight, setLabelHeight] = useState(0);
  const [railVisible, setRailVisible] = useState(true);
  const [, setTimerTick] = useState(0);
  const stepContentOpacity = useRef(new Animated.Value(0)).current;
  const swipeStart = useRef<number | null>(null);
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers();
  const step = steps[index];
  const durations = useMemo(
    () => (step ? parseDurationMatches(step.text) : []),
    [step],
  );
  const hasInitialStep = initialComponentIndex !== null && initialStepIndex !== null;
  useLayoutEffect(() => {
    if (!visible || !hasInitialStep) return;

    const targetIndex = steps.findIndex(
      (item) => item.componentIndex === initialComponentIndex && item.stepIndex === initialStepIndex,
    );
    if (targetIndex >= 0) setIndex(targetIndex);
  }, [hasInitialStep, initialComponentIndex, initialStepIndex, steps, visible]);
  const storageKey = `cook-mode:${recipe.id}`;
  const adjustFontScale = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = getFontScaleIndex(fontScale);
      const next = FONT_SCALES[currentIndex + direction];
      if (next === undefined || next === fontScale) return;

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
    },
    [fontScale, stepContentOpacity],
  );

  useEffect(() => {
    if (!visible || hasInitialStep) return;
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (!value) return;
      try {
        const saved = JSON.parse(value) as { index?: number };
        setIndex(Math.min(saved.index ?? 0, Math.max(0, steps.length - 1)));
      } catch {}
    });
  }, [hasInitialStep, visible, storageKey, steps.length]);

  useEffect(() => {
    void AsyncStorage.getItem(RAIL_VISIBLE_STORAGE_KEY).then((value) => {
      if (value !== null) setRailVisible(value === "1");
    });
  }, []);

  const handleToggleRail = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRailVisible((current) => {
      const next = !current;
      void AsyncStorage.setItem(RAIL_VISIBLE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible || !isAppActive) {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_COOK_TAG);
      return;
    }

    void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_COOK_TAG);

    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_COOK_TAG);
    };
  }, [isAppActive, visible]);
  useEffect(() => {
    void AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY).then((value) => {
      const savedScale = Number(value);
      if (savedScale >= MIN_FONT_SCALE && savedScale <= MAX_FONT_SCALE) {
        setFontScale(FONT_SCALES[getFontScaleIndex(savedScale)]);
      }
    });
  }, []);
  useEffect(() => {
    if (visible)
      void AsyncStorage.setItem(storageKey, JSON.stringify({ index }));
  }, [visible, storageKey, index]);
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
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);
  useLayoutEffect(() => {
    if (!visible) return;
    navigation.setOptions({
      headerLeft: () => <CookModeBackButton onClose={onClose} muted={muted} closeLabel={t("cookMode.close")} />,
      headerRight: () => (
        <CookModeToolbar
          canDecreaseTextSize={fontScale > MIN_FONT_SCALE}
          canIncreaseTextSize={fontScale < MAX_FONT_SCALE}
          onDecreaseTextSize={() => adjustFontScale(-1)}
          onIncreaseTextSize={() => adjustFontScale(1)}
          railVisible={railVisible}
          onToggleRail={handleToggleRail}
          onClose={onClose}
          muted={muted}
          decreaseTextSizeLabel={t("cookMode.decreaseTextSize")}
          increaseTextSizeLabel={t("cookMode.increaseTextSize")}
          toggleRailLabel={t("cookMode.toggleIngredientRail")}
          closeLabel={t("cookMode.close")}
        />
      ),
    });
  }, [adjustFontScale, fontScale, handleToggleRail, muted, navigation, onClose, railVisible, t, visible]);
  if (!visible || !step) return null;
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
  return (
    <View
      style={[styles.root, { backgroundColor: bg }]}
    >
      <StatusBar style={Platform.OS === "ios" ? "auto" : dark ? "light" : "dark"} animated />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: Math.max(92, insets.top + 66),
          paddingBottom: Math.max(24, insets.bottom + 12),
        }}
      >
        <View style={styles.progress}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressItem,
                {
                  backgroundColor:
                    i <= index ? text : inactiveProgress,
                },
              ]}
            />
          ))}
        </View>
        <View
          style={styles.main}
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
          <View
            style={styles.instructionArea}
            onLayout={(event) => setInstructionAreaHeight(event.nativeEvent.layout.height)}
          >
            <Animated.Text
              style={[styles.stepLabel, { color: muted, opacity: stepContentOpacity }]}
              onLayout={(event) => setLabelHeight(event.nativeEvent.layout.height)}
            >
              STEP {index + 1}
            </Animated.Text>
            <Animated.Text
              key={`${index}-${instructionAreaHeight}-${instructionFontSize}`}
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
                const availableHeight =
                  instructionAreaHeight - labelHeight - styles.stepLabel.marginBottom - INSTRUCTION_HEIGHT_BUFFER;
                if (
                  instructionAreaHeight > 0 &&
                  instructionHeight > availableHeight &&
                  instructionFontSize > 17
                ) {
                  setInstructionFontSize((size) => Math.max(17, size - 2));
                } else if (instructionAreaHeight > 0) {
                  setInstructionReady(true);
                }
              }}
            >
              {step.text}
            </Animated.Text>
          </View>
          <Animated.View style={{ opacity: stepContentOpacity }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.timerScroll}
              contentContainerStyle={styles.timerGrid}
            >
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
                          source: 'cook-mode',
                          totalSeconds: duration.seconds,
                        })
                      : !done && (running ? pauseTimer(id) : resumeTimer(id))
                  }
                  style={styles.timerRow}
                >
                  <View style={styles.timerControl}>
                    <Ionicons
                      name={done ? "checkmark" : running ? "pause" : "play"}
                      size={17}
                      color={text}
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
            </ScrollView>
          </Animated.View>
          {railVisible && (
            <IngredientRail
              rows={railRows}
              targetIndex={railTargets[index] ?? 0}
              stepKey={index}
              text={text}
              muted={muted}
              bg={bgHex}
            />
          )}
        </View>
        <View style={styles.footer}>
          <Pressable
            disabled={index === 0}
            onPress={() => go(index - 1)}
            style={[
              styles.navButton,
              {
                backgroundColor: secondaryButton,
                opacity: index === 0 ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={28} color={text} />
          </Pressable>
          <Animated.Text
            style={[styles.count, { color: text, opacity: stepContentOpacity }]}
          >
            {index + 1} of {steps.length}
          </Animated.Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
  },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 12 },
  toolbarButton: { minWidth: 24, minHeight: 36, alignItems: "center", justifyContent: "center" },
  fontControlDisabled: { opacity: 0.3 },
  fontControlSmall: { fontSize: 13, fontWeight: "600" },
  fontControlLarge: { fontSize: 18, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 5 },
  progressItem: { flex: 1, height: 4, borderRadius: 2 },
  main: { flex: 1, alignItems: "center" },
  instructionArea: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center" },
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
  timerScroll: { flexGrow: 0, marginTop: 17 },
  timerGrid: { flexDirection: "row", alignItems: "center", gap: 7 },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 13,
    backgroundColor: "#ea8e4e",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerControl: { alignItems: "center", justifyContent: "center" },
  timerTime: { fontSize: 22, fontWeight: "700" },
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
});

export default CookMode;
