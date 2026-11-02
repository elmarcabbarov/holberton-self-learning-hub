import { useTranslation } from "react-i18next";
import type { Score } from "@hub/contracts";

/** "2 of 3 correct · 1 not graded" — counts only, no percentages (D-005). */
export function ScoreLine({ score }: { score: Score }) {
  const { t } = useTranslation();
  const parts = [t("quizzes.score", { correct: score.correct, total: score.total })];
  if (score.ungraded > 0) parts.push(t("quizzes.ungraded", { count: score.ungraded }));
  if (score.unanswered > 0) parts.push(t("quizzes.unanswered", { count: score.unanswered }));
  return <>{parts.join(" · ")}</>;
}
