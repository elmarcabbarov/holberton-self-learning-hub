import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { redeemToken, type BootstrapResult } from "../api.ts";
import { SignInHelp } from "../components/SignInHelp.tsx";
import { takeBootstrapToken } from "../bootstrapToken.ts";

/** Reads the one-time token from the URL fragment, removes it from the address bar, then exchanges it (D-044). */
export function Auth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<BootstrapResult | "pending">("pending");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeBootstrapToken();
    if (!token) { setResult("invalid"); return; }
    void redeemToken(token).then(async (r) => {
      setResult(r);
      if (r === "ok") {
        // Write the server's answer straight into the cache: an initial status request sent
        // before the cookie existed can otherwise resolve last and show the sign-in page again.
        await queryClient.cancelQueries({ queryKey: ["auth"] });
        queryClient.setQueryData(["auth"], { authenticated: true });
        await navigate({ to: "/" });
      }
    });
  }, [navigate, queryClient]);

  if (result === "pending" || result === "ok") {
    return <p className="p-10 text-muted" role="status">{t("auth.signingIn")}</p>;
  }
  return <SignInHelp errorKey={result === "rate_limited" ? "auth.rateLimited" : result === "invalid" ? "auth.invalid" : "auth.error"} />;
}
