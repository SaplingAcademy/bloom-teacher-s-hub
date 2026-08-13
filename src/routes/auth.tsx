import { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { t as i18nT } from "@/lib/i18n";
import { Mail, Lock, User, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { z } from "zod";

const authSearchSchema = z.object({
  error: z.string().optional(),
  error_code: z.string().optional(),
  error_description: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  token_hash: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearchSchema.parse(search),
  component: AuthPage,
});

const translations = {
  en: {
    titleSignIn: "Welcome back",
    subtitleSignIn: "Log in to your Bloom account to continue",
    titleSignUp: "Create your account",
    subtitleSignUp: "Start managing your language teaching business today",
    titleReset: "Reset your password",
    subtitleReset: "Enter your email to receive a password reset link",
    emailLabel: "Email address",
    emailPlaceholder: "name@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "••••••••",
    nameLabel: "Full Name",
    namePlaceholder: "Jane Doe",
    btnSignIn: "Log in",
    btnSignUp: "Create account",
    btnReset: "Send reset link",
    haveAccount: "Already have an account? Log in",
    noAccount: "Don't have an account? Sign up",
    forgotPassword: "Forgot your password?",
    backToLogin: "Back to log in",
    errorHeader: "Authentication error",
    signUpSuccess: "Account created! Check your email to confirm registration.",
    signInSuccess: "Welcome back to Bloom!",
    resetSuccess: "Password reset link sent to your email.",
    loadingText: "Processing...",
    brandingTitle: "Bloom",
    brandingSubtitle: "The all-in-one workspace built for independent language teachers.",
    brandingStatTeachers: "Every part of your business, all in one place.",
    brandingStatClasses: "Students, scheduling, lessons, and finances growing together.",
    confirmPasswordLabel: "Confirm Password",
    confirmPasswordPlaceholder: "••••••••",
    passwordsDontMatch: "Passwords do not match",
    reqLength: "At least 8 characters",
    reqUppercase: "At least 1 uppercase letter",
    reqLowercase: "At least 1 lowercase letter",
    reqNumber: "At least 1 number",
    reqSpecial: "At least 1 special character (e.g. ! @ # $ % & *)",
    reqMatch: "Passwords match",
    googleBtn: "Continue with Google",
    orDivider: "or",
  },
  pt: {
    titleSignIn: "Bem-vindo de volta",
    subtitleSignIn: "Faça login na sua conta Bloom para continuar",
    titleSignUp: "Crie sua conta",
    subtitleSignUp: "Comece a gerenciar suas aulas e alunos hoje mesmo",
    titleReset: "Recuperar senha",
    subtitleReset: "Digite seu e-mail para receber um link de redefinição",
    emailLabel: "Endereço de e-mail",
    emailPlaceholder: "nome@exemplo.com",
    passwordLabel: "Senha",
    passwordPlaceholder: "••••••••",
    nameLabel: "Nome Completo",
    namePlaceholder: "Maria Silva",
    btnSignIn: "Entrar",
    btnSignUp: "Criar conta",
    btnReset: "Enviar link de recuperação",
    haveAccount: "Já tem uma conta? Faça login",
    noAccount: "Não tem uma conta? Cadastre-se",
    forgotPassword: "Esqueceu sua senha?",
    backToLogin: "Voltar para o login",
    errorHeader: "Erro de autenticação",
    signUpSuccess: "Conta criada! Verifique seu e-mail para confirmar o cadastro.",
    signInSuccess: "Bem-vindo de volta ao Bloom!",
    resetSuccess: "Link de recuperação enviado para o seu e-mail.",
    loadingText: "Processando...",
    brandingTitle: "Bloom",
    brandingSubtitle:
      "O espaço de trabalho completo criado para professores de idiomas independentes.",
    brandingStatTeachers: "Todas as ramificações do seu negócio em um só lugar.",
    brandingStatClasses: "Alunos, agenda, aulas e finanças crescendo juntas.",
    confirmPasswordLabel: "Confirmar Senha",
    confirmPasswordPlaceholder: "••••••••",
    passwordsDontMatch: "As senhas não coincidem",
    reqLength: "Mínimo de 8 caracteres",
    reqUppercase: "Pelo menos 1 letra maiúscula",
    reqLowercase: "Pelo menos 1 letra minúscula",
    reqNumber: "Pelo menos 1 número",
    reqSpecial: "Pelo menos 1 caractere especial (ex.: ! @ # $ % & *)",
    reqMatch: "As senhas são idênticas",
    googleBtn: "Continuar com o Google",
    orDivider: "ou",
  },
};
type AuthView =
  | "signin"
  | "signup"
  | "reset"
  | "unconfirmed"
  | "confirmed_success"
  | "confirmed_error";

function mapSupabaseAuthError(err: any, lang: "pt" | "en"): string {
  if (!err) return "";
  const msg = err.message?.toLowerCase() || "";
  const status = err.status;

  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
    return lang === "pt" ? "E-mail ou senha incorretos." : "Invalid email or password.";
  }
  if (msg.includes("email not confirmed")) {
    return lang === "pt" ? "E-mail ainda não confirmado. Verifique sua caixa de entrada." : "Email not verified yet. Please check your inbox.";
  }
  if (msg.includes("signup is disabled") || msg.includes("signups not allowed")) {
    return lang === "pt"
      ? "O cadastro público está desativado. O Bloom está em fase de Closed Alpha para convidados."
      : "Public registration is disabled. Bloom is currently in Closed Alpha for invited teachers.";
  }
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return lang === "pt" ? "Muitas solicitações em sequência. Por favor, aguarde." : "Too many requests. Please wait before trying again.";
  }
  if (msg.includes("token has expired") || msg.includes("invalid token") || msg.includes("link is invalid")) {
    return lang === "pt" ? "O link de confirmação expirou ou é inválido." : "The link has expired or is invalid.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return lang === "pt" ? "Este e-mail já está cadastrado. Tente fazer login." : "This email is already registered. Please try logging in.";
  }
  return err.message || (lang === "pt" ? "Erro ao processar autenticação." : "Authentication error.");
}

function AuthPage() {
  const { user, loading: authLoading, profile, setLocalUser } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const {
    error: urlError,
    error_description: urlErrorDescription,
    code: urlCode,
    type: urlType,
    token_hash: urlTokenHash,
  } = searchParams;
  const callbackProcessedRef = useRef<boolean>(false);

  const [view, setView] = useState<AuthView>(() => {
    if (typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("bloom.auth.view");
      if (savedView === "unconfirmed") return "unconfirmed";
    }
    return "signin";
  });
  const [confirmationErrorMsg, setConfirmationErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("bloom.confirmation.email") || "";
    }
    return "";
  });

  const [cooldownTime, setCooldownTime] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedCooldown = sessionStorage.getItem("bloom.confirmation.cooldown");
      if (savedCooldown) {
        const parsed = parseInt(savedCooldown, 10);
        const savedAt = sessionStorage.getItem("bloom.confirmation.cooldown_at");
        if (savedAt && !isNaN(parsed)) {
          const elapsed = Math.floor((Date.now() - parseInt(savedAt, 10)) / 1000);
          const remaining = parsed - elapsed;
          if (remaining > 0) {
            console.log(`[Resend] Restoring cooldown from sessionStorage: ${remaining}s remaining.`);
            return remaining;
          }
        }
      }
    }
    return 0;
  });
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [resendErrorMessage, setResendErrorMessage] = useState("");

  // Persist view to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("bloom.auth.view", view);
      if (view === "signin") {
        sessionStorage.removeItem("bloom.confirmation.email");
        sessionStorage.removeItem("bloom.confirmation.cooldown");
        sessionStorage.removeItem("bloom.confirmation.cooldown_at");
        setConfirmationEmail("");
        setCooldownTime(0);
        setResendStatus("idle");
        setResendErrorMessage("");
      }
    }
  }, [view]);

  // Handle countdown logic
  useEffect(() => {
    if (cooldownTime <= 0) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("bloom.confirmation.cooldown");
        sessionStorage.removeItem("bloom.confirmation.cooldown_at");
      }
      return;
    }

    console.log(`[Resend] Cooldown ticker: ${cooldownTime}s remaining.`);
    const timer = setInterval(() => {
      setCooldownTime((prev) => {
        const next = prev - 1;
        if (typeof window !== "undefined") {
          sessionStorage.setItem("bloom.confirmation.cooldown", String(next));
          sessionStorage.setItem("bloom.confirmation.cooldown_at", String(Date.now()));
        }
        if (next <= 0) {
          console.log("[Resend] Cooldown finished.");
          clearInterval(timer);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownTime]);

  const startCooldown = () => {
    console.log("[Resend] Cooldown started. Setting 60 seconds.");
    setCooldownTime(60);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("bloom.confirmation.cooldown", "60");
      sessionStorage.setItem("bloom.confirmation.cooldown_at", String(Date.now()));
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = confirmationEmail || email;
    if (!targetEmail) {
      console.log("[Resend] Failed: No email address found.");
      setResendStatus("error");
      setResendErrorMessage(
        lang === "pt"
          ? "Endereço de e-mail não disponível."
          : "Email address not found."
      );
      return;
    }

    if (cooldownTime > 0) {
      console.log(`[Resend] Blocked: Button is on cooldown for another ${cooldownTime}s.`);
      return;
    }

    console.log(`[Resend] Email being used: ${targetEmail}`);
    console.log("[Resend] Resend request started.");
    setResendStatus("sending");
    setResendErrorMessage("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      console.log("[Resend] Resend response received:", { data, error });

      if (error) {
        throw error;
      }

      setResendStatus("success");
      toast.success(
        lang === "pt"
          ? "E-mail de confirmação reenviado com sucesso!"
          : "Confirmation email resent successfully!",
      );
      startCooldown();
    } catch (err: any) {
      console.error("[Resend] Resend error caught:", err);
      setResendStatus("error");

      // Handle and distinguish errors
      let errMsg = "";
      if (err.status === 429 || err.message?.toLowerCase().includes("rate limit") || err.message?.toLowerCase().includes("too many")) {
        errMsg = lang === "pt"
          ? "Muitas solicitações. Por favor, aguarde antes de tentar novamente."
          : "Too many requests. Please wait before trying again.";
      } else if (err.message?.toLowerCase().includes("already confirmed") || err.message?.toLowerCase().includes("verified")) {
        errMsg = lang === "pt"
          ? "Este e-mail já foi confirmado. Tente fazer login."
          : "This email is already confirmed. Please try logging in.";
      } else if (typeof window !== "undefined" && !window.navigator.onLine) {
        errMsg = lang === "pt"
          ? "Erro de conexão. Verifique sua internet."
          : "Connection error. Please check your internet connection.";
      } else {
        errMsg = err.message || (lang === "pt" ? "Erro ao enviar e-mail." : "Failed to send email.");
      }

      setResendErrorMessage(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Refs for auto-focusing input elements
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isInviteFlow = Boolean(
    urlType === "invite" ||
    urlType === "recovery" ||
    (typeof window !== "undefined" &&
      (window.location.hash.includes("type=invite") || window.location.hash.includes("type=recovery")))
  );

  const t = {
    titleSignIn: i18nT("auth.titleSignIn", lang),
    subtitleSignIn: i18nT("auth.subtitleSignIn", lang),
    titleSignUp: isInviteFlow ? i18nT("auth.titleInvite", lang) : i18nT("auth.titleSignUp", lang),
    subtitleSignUp: isInviteFlow ? i18nT("auth.subtitleInvite", lang) : i18nT("auth.subtitleSignUp", lang),
    titleReset: i18nT("auth.titleReset", lang),
    subtitleReset: i18nT("auth.subtitleReset", lang),
    emailLabel: i18nT("auth.emailLabel", lang),
    emailPlaceholder: i18nT("auth.emailPlaceholder", lang),
    passwordLabel: i18nT("auth.passwordLabel", lang),
    passwordPlaceholder: i18nT("auth.passwordPlaceholder", lang),
    nameLabel: i18nT("auth.nameLabel", lang),
    namePlaceholder: i18nT("auth.namePlaceholder", lang),
    btnSignIn: i18nT("auth.btnSignIn", lang),
    btnSignUp: isInviteFlow ? i18nT("auth.btnAcceptInvite", lang) : i18nT("auth.btnSignUp", lang),
    btnReset: i18nT("auth.btnReset", lang),
    haveAccount: i18nT("auth.haveAccount", lang),
    noAccount: isInviteFlow ? "" : i18nT("auth.noAccount", lang),
    closedAlphaTag: i18nT("auth.closedAlphaTag", lang),
    closedAlphaNotice: i18nT("auth.closedAlphaNotice", lang),
    forgotPassword: i18nT("auth.forgotPassword", lang),
    backToLogin: i18nT("auth.backToLogin", lang),
    errorHeader: i18nT("common.error", lang),
    signUpSuccess: i18nT("auth.signUpSuccess", lang, "Account created! Check your email to confirm registration."),
    signInSuccess: i18nT("auth.signInSuccess", lang, "Welcome back to Bloom!"),
    resetSuccess: i18nT("auth.resetSuccess", lang, "Password reset link sent to your email."),
    loadingText: i18nT("common.loading", lang),
    brandingTitle: "Bloom",
    brandingSubtitle: lang === "pt"
      ? "O espaço de trabalho completo criado para professores de idiomas independentes."
      : "The all-in-one workspace built for independent language teachers.",
    brandingStatTeachers: lang === "pt"
      ? "Todas as ramificações do seu negócio em um só lugar."
      : "Every part of your business, all in one place.",
    brandingStatClasses: lang === "pt"
      ? "Alunos, agenda, aulas e finanças crescendo juntas."
      : "Students, scheduling, lessons, and finances growing together.",
    confirmPasswordLabel: i18nT("auth.confirmPasswordLabel", lang),
    confirmPasswordPlaceholder: i18nT("auth.confirmPasswordPlaceholder", lang),
    passwordsDontMatch: i18nT("auth.reqMatch", lang),
    reqLength: i18nT("auth.reqLength", lang),
    reqUppercase: i18nT("auth.reqUppercase", lang),
    reqLowercase: i18nT("auth.reqLowercase", lang),
    reqNumber: i18nT("auth.reqNumber", lang),
    reqSpecial: i18nT("auth.reqSpecial", lang),
    reqMatch: i18nT("auth.reqMatch", lang),
    googleBtn: i18nT("auth.googleBtn", lang),
    orDivider: i18nT("auth.orDivider", lang),
  };

  // Real-time password criteria validations
  const isLengthValid = password.length >= 8;
  const isUppercaseValid = /[A-Z]/.test(password);
  const isLowercaseValid = /[a-z]/.test(password);
  const isNumberValid = /\d/.test(password);
  const isSpecialValid = /[!@#$%&*]/.test(password);
  const isMatchValid = password === confirmPassword && confirmPassword.length > 0;

  // Sign up button disabled logic
  const isSignUpFormValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    isLengthValid &&
    isUppercaseValid &&
    isLowercaseValid &&
    isNumberValid &&
    isSpecialValid &&
    isMatchValid;

  // Clear inputs, dismiss previous error toasts, and focus the primary field on view change
  useEffect(() => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    toast.dismiss();

    const focusTimer = setTimeout(() => {
      if (view === "signup") {
        nameInputRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [view]);

  // Helper to continue from confirmed_success to Login or App
  const handleContinueToLogin = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("bloom.auth.view");
      sessionStorage.removeItem("bloom.confirmation.email");
    }

    if (user) {
      const onboardingCompleted =
        Boolean(profile?.onboarding_completed) ||
        (typeof window !== "undefined"
          ? localStorage.getItem("bloom.onboarding.completed") === "true"
          : false);

      const onboardingSkipped =
        profile?.onboarding_status === "skipped" ||
        (typeof window !== "undefined"
          ? localStorage.getItem("bloom.onboarding.skipped") === "true"
          : false);

      if (onboardingCompleted || onboardingSkipped) {
        navigate({ to: "/" });
      } else {
        navigate({ to: "/onboarding" });
      }
    } else {
      if (confirmationEmail) {
        setEmail(confirmationEmail);
      }
      setView("signin");
      navigate({ to: "/auth", replace: true });
    }
  };

  // Auto-redirect timer when confirmation succeeds
  useEffect(() => {
    if (view !== "confirmed_success") return;

    const timer = setTimeout(() => {
      handleContinueToLogin();
    }, 2800);

    return () => clearTimeout(timer);
  }, [view, user, profile]);

  // Inspect and process Supabase Auth callback parameters (PKCE code, token hash, error, implicit hash)
  useEffect(() => {
    const processAuthCallback = async () => {
      if (typeof window === "undefined" || callbackProcessedRef.current) return;

      const hashStr = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hashStr);
      const hashError = hashParams.get("error");
      const hashErrorDesc = hashParams.get("error_description");
      const hashType = hashParams.get("type");

      const hasCallback =
        Boolean(urlCode) ||
        Boolean(urlTokenHash) ||
        Boolean(urlError) ||
        Boolean(urlErrorDescription) ||
        Boolean(hashError) ||
        Boolean(hashErrorDesc) ||
        hashType === "signup" ||
        urlType === "signup" ||
        hashParams.has("access_token");

      if (!hasCallback) return;

      callbackProcessedRef.current = true;
      console.log("[Auth] Auth callback detected in URL:", window.location.href);
      setLoading(true);

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("bloom.auth.view");
      }

      // Case 1: Callback error returned from Supabase
      if (urlError || urlErrorDescription || hashError || hashErrorDesc) {
        const rawError = urlErrorDescription || hashErrorDesc || urlError || hashError || "";
        const decodedError = decodeURIComponent(rawError);
        console.error("[Auth] Callback error received:", decodedError);

        let friendlyMsg =
          lang === "pt"
            ? "O link de confirmação é inválido ou expirou."
            : "The confirmation link is invalid or has expired.";

        if (decodedError.toLowerCase().includes("expired")) {
          friendlyMsg =
            lang === "pt"
              ? "O link de confirmação expirou. Por favor, solicite um novo e-mail."
              : "The confirmation link has expired. Please request a new email.";
        } else if (
          decodedError.toLowerCase().includes("already") ||
          decodedError.toLowerCase().includes("used")
        ) {
          friendlyMsg =
            lang === "pt"
              ? "Este e-mail já foi confirmado ou o link já foi utilizado."
              : "This email has already been confirmed or the link was already used.";
        }

        setConfirmationErrorMsg(friendlyMsg);
        setView("confirmed_error");
        setLoading(false);
        navigate({ to: "/auth", replace: true });
        return;
      }

      // Case 2: Code parameter present (PKCE flow)
      if (urlCode) {
        try {
          console.log("[Auth] Exchanging PKCE code for session...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(urlCode);
          if (error) throw error;

          console.log("[Auth] Code exchanged successfully for user:", data.user?.email);
          if (data.user?.email) {
            setEmail(data.user.email);
            setConfirmationEmail(data.user.email);
          }
          setView("confirmed_success");
        } catch (err: any) {
          console.error("[Auth] Code exchange error:", err);
          setConfirmationErrorMsg(
            err.message?.toLowerCase().includes("expired")
              ? (lang === "pt"
                  ? "O link de confirmação expirou. Por favor, solicite um novo e-mail."
                  : "The confirmation link has expired. Please request a new email.")
              : (lang === "pt"
                  ? "Não foi possível validar o link de confirmação."
                  : "Failed to validate confirmation link.")
          );
          setView("confirmed_error");
        } finally {
          setLoading(false);
          navigate({ to: "/auth", replace: true });
        }
        return;
      }

      // Case 3: token_hash parameter present (OTP flow)
      if (urlTokenHash) {
        try {
          console.log("[Auth] Verifying OTP token hash...");
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: urlTokenHash,
            type: (urlType as any) || "signup",
          });
          if (error) throw error;

          console.log("[Auth] Token hash verified successfully for user:", data.user?.email);
          if (data.user?.email) {
            setEmail(data.user.email);
            setConfirmationEmail(data.user.email);
          }
          setView("confirmed_success");
        } catch (err: any) {
          console.error("[Auth] Token hash verification error:", err);
          setConfirmationErrorMsg(
            lang === "pt"
              ? "O link de confirmação expirou ou é inválido."
              : "Confirmation link is expired or invalid."
          );
          setView("confirmed_error");
        } finally {
          setLoading(false);
          navigate({ to: "/auth", replace: true });
        }
        return;
      }

      // Case 4: Implicit hash token (access_token) or type=signup
      if (hashType === "signup" || urlType === "signup" || hashParams.has("access_token")) {
        console.log("[Auth] Implicit token/signup callback detected. Confirmation successful.");
        setView("confirmed_success");
        setLoading(false);
        navigate({ to: "/auth", replace: true });
      }
    };

    processAuthCallback();
  }, [urlCode, urlTokenHash, urlType, urlError, urlErrorDescription, lang, navigate]);

  // Redirect to home/onboarding if user is already authenticated (outside of confirmation screens)
  useEffect(() => {
    if (!authLoading && user && view !== "confirmed_success" && view !== "confirmed_error" && view !== "unconfirmed") {
      console.log("[Auth] User is authenticated, checking onboarding status...");
      const onboardingCompleted =
        Boolean(profile?.onboarding_completed) ||
        (typeof window !== "undefined"
          ? localStorage.getItem("bloom.onboarding.completed") === "true"
          : false);

      const onboardingSkipped =
        profile?.onboarding_status === "skipped" ||
        (typeof window !== "undefined"
          ? localStorage.getItem("bloom.onboarding.skipped") === "true"
          : false);

      if (onboardingCompleted || onboardingSkipped) {
        navigate({ to: "/" });
      } else {
        navigate({ to: "/onboarding" });
      }
    }
  }, [user, authLoading, view, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    try {
      if (view === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (
            error.code === "email_not_confirmed" ||
            error.message?.toLowerCase().includes("confirm")
          ) {
            sessionStorage.setItem("bloom.confirmation.email", email);
            setConfirmationEmail(email);
            setView("unconfirmed");
            toast.error(
              lang === "pt"
                ? "Por favor, confirme seu e-mail antes de acessar."
                : "Please confirm your email before logging in.",
            );
            return;
          }
          throw error;
        }

        if (data?.user) {
          setLocalUser(data.user);
        }

        toast.success(t.signInSuccess);

        // Fetch user profile onboarding status from database
        const { data: profileData } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .single();

        const isCompleted =
          profileData?.onboarding_completed ??
          (typeof window !== "undefined"
            ? localStorage.getItem("bloom.onboarding.completed") === "true"
            : false);

        if (isCompleted) {
          navigate({ to: "/" });
        } else {
          navigate({ to: "/onboarding" });
        }
      } else if (view === "signup") {
        console.log("Starting signup...");
        if (password !== confirmPassword) {
          console.error("Signup failed: passwords do not match");
          throw new Error(t.passwordsDontMatch);
        }
        if (
          !isLengthValid ||
          !isUppercaseValid ||
          !isLowercaseValid ||
          !isNumberValid ||
          !isSpecialValid
        ) {
          console.error("Signup failed: password criteria not met");
          throw new Error(
            lang === "pt"
              ? "A senha não atende a todos os requisitos de segurança."
              : "The password does not meet all security requirements.",
          );
        }
        console.log("[Auth] Calling Supabase Auth signUp...");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim() || undefined,
            },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });

        console.log("[Auth] Supabase signUp response received:", { data, error });

        if (error) {
          console.error("[Auth] Supabase Auth signUp returned an error:", error);
          throw error;
        }

        if (data?.user) {
          console.log("[Auth] User created successfully:", data.user.id);
          // Initialize user profile data in localStorage
          const defaultProfile = {
            photo: "",
            name: name.trim() || "",
            headline: "ESL Teacher / Language Coach",
            bio:
              lang === "pt"
                ? "Professor de idiomas apaixonado por ensinar. Ajudando alunos a alcançarem a fluência."
                : "Passionate language educator helping students achieve fluency.",
            country: lang === "pt" ? "Brasil" : "Brazil",
            teachingAreas: [],
            subjectsTaught: [],
            experience: 1,
            linkedin: "",
            twitter: "",
            github: "",
            website: "",
          };
          localStorage.setItem("bloom.profile.data", JSON.stringify(defaultProfile));
          console.log("[Auth] Default profile created.");

          // Clear onboarding completed flag so they go to onboarding
          localStorage.removeItem("bloom.onboarding.completed");

          if (data.session) {
            console.log("[Auth] Auto-confirmed or active session found. Redirecting to app...");
            setLocalUser(data.user);
            toast.success(
              lang === "pt" ? "Conta criada com sucesso!" : "Account created successfully!",
            );
            navigate({ to: "/" });
          } else {
            console.log("[Auth] Email confirmation required. Switching view to unconfirmed.");
            sessionStorage.setItem("bloom.confirmation.email", email);
            setConfirmationEmail(email);
            setView("unconfirmed");
            toast.success(
              lang === "pt"
                ? "Cadastro realizado! Por favor, confirme seu e-mail."
                : "Registration successful! Please confirm your email.",
            );
          }
        } else {
          console.error("[Auth] Supabase signUp returned no error, but data.user is missing.");
          throw new Error(
            lang === "pt"
              ? "Não foi possível criar a conta. Por favor, tente novamente."
              : "Account creation failed. Please try again.",
          );
        }
      } else if (view === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success(t.resetSuccess);
        setView("signin");
      }
    } catch (err: any) {
      console.error("[Auth] Auth error caught in form handler:", err);
      const userMsg = mapSupabaseAuthError(err, lang === "pt" ? "pt" : "en");
      toast.error(userMsg);
    } finally {
      console.log("Auth process completed (finally block triggered). Setting loading to false.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth`;
    console.log("[Auth] Starting Google OAuth flow...");
    console.log("[Auth] Redirect URL being used:", redirectTo);
    try {
      const response = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });
      console.log("[Auth] Provider response (before redirect):", response);
      if (response.error) {
        throw response.error;
      }
    } catch (err) {
      const error = err as Error;
      console.error("[Auth] Google Auth error:", error);
      toast.error(error.message || t.errorHeader);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background font-figtree">
      {/* Left panel - Branding (only visible on desktop) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#163020] p-12 text-white relative overflow-hidden select-none">
        {/* Decorative background grid elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-800/40 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-emerald-950/30 blur-2xl pointer-events-none" />

        {/* Top Logo */}
        <div className="flex items-center gap-2 relative z-10">
          <div className="h-9 w-9 rounded-xl bg-[#F4EBE1] flex items-center justify-center shadow-md">
            <span className="font-outfit font-extrabold text-[#163020] text-xl">B</span>
          </div>
          <span className="font-outfit font-bold text-2xl tracking-tight">{t.brandingTitle}</span>
        </div>

        {/* Center content */}
        <div className="max-w-md my-auto relative z-10 space-y-6">
          <h1 className="font-outfit font-extrabold text-4xl lg:text-5xl leading-tight">
            {lang === "pt" ? "Cultive sua escola de idiomas" : "Grow your language school"}
          </h1>
          <p className="text-emerald-100/80 text-lg font-medium leading-relaxed">
            {t.brandingSubtitle}
          </p>

          <div className="pt-8 border-t border-emerald-800/60 grid grid-cols-2 gap-6">
            <div>
              <p className="text-2xl font-bold font-outfit text-[#F4EBE1]">
                {t.brandingStatTeachers}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold font-outfit text-[#F4EBE1]">
                {t.brandingStatClasses}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-emerald-300/50 relative z-10 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>
            {lang === "pt"
              ? "Seus dados protegidos com acesso individual e seguro."
              : "Your data is protected with secure, individual access."}
          </span>
        </div>
      </div>

      {/* Right panel - Auth Forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 bg-card">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            {/* Small logo on mobile */}
            <div className="flex justify-center lg:justify-start lg:hidden mb-6">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-[#163020] flex items-center justify-center">
                  <span className="font-outfit font-extrabold text-[#F4EBE1] text-xl">B</span>
                </div>
                <span className="font-outfit font-bold text-2xl tracking-tight text-[#163020]">
                  {t.brandingTitle}
                </span>
              </div>
            </div>

            <h2 className="text-3xl font-extrabold font-outfit tracking-tight text-foreground">
              {view === "signin" && t.titleSignIn}
              {view === "signup" && t.titleSignUp}
              {view === "reset" && t.titleReset}
              {view === "unconfirmed" &&
                (lang === "pt" ? "Confirme seu e-mail" : "Confirm your email")}
              {view === "confirmed_success" &&
                (lang === "pt" ? "E-mail confirmado! 🌱" : "Email confirmed! 🌱")}
              {view === "confirmed_error" &&
                (lang === "pt" ? "Link de confirmação ⚠️" : "Confirmation link ⚠️")}
            </h2>
            <p className="text-sm text-muted-foreground font-medium">
              {view === "signin" && t.subtitleSignIn}
              {view === "signup" && t.subtitleSignUp}
              {view === "reset" && t.subtitleReset}
              {view === "unconfirmed" &&
                (lang === "pt"
                  ? "Quase lá! Precisamos que você confirme seu e-mail para continuar."
                  : "Almost there! We need you to confirm your email to continue.")}
              {view === "confirmed_success" &&
                (lang === "pt"
                  ? "Sua conta Bloom está pronta. Agora é só entrar para começar."
                  : "Your Bloom account is ready. Now just log in to start.")}
              {view === "confirmed_error" &&
                (lang === "pt"
                  ? "Não foi possível validar seu link de confirmação."
                  : "Could not validate your confirmation link.")}
            </p>
          </div>

          {/* Google Sign In Option */}
          {view !== "reset" &&
            view !== "unconfirmed" &&
            view !== "confirmed_success" &&
            view !== "confirmed_error" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex h-11 items-center justify-center gap-3 rounded-xl border border-border bg-card text-foreground hover:bg-secondary/45 font-bold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path
                      d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.6h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.77 21.56,11.4 21.35,11.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12,20.6c2.43,0 4.47,-0.8 5.96,-2.2l-3.3,-2.6c-0.9,0.6 -2.07,0.98 -3.3,0.98 -2.34,0 -4.33,-1.58 -5.04,-3.7H2.88v2.7C4.38,18.78 7.94,20.6 12,20.6z"
                      fill="#34A853"
                    />
                    <path
                      d="M6.96,13.08a5.1,5.1 0 0,1 0,-3.16V7.22H2.88a9.9,9.9 0 0,0 0,8.56l4.08,-3.2v0.5z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12,6.42c1.3,0 2.5,0.45 3.4,1.3l2.5,-2.5C16.4,3.84 14.4,3.26 12,3.26 7.94,3.26 4.38,5.08 2.88,8.08l4.08,3.2C7.67,9.1 9.66,6.42 12,6.42z"
                      fill="#EA4335"
                    />
                  </g>
                </svg>
                <span>{t.googleBtn}</span>
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-border/80"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-muted-foreground/60 uppercase tracking-wider select-none">
                  {t.orDivider}
                </span>
                <div className="flex-grow border-t border-border/80"></div>
              </div>
            </div>
          )}

          {/* Form / Dynamic State Card */}
          {view === "confirmed_success" ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-6 space-y-4 shadow-sm text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 shadow-inner">
                  <ShieldCheck className="h-7 w-7 text-emerald-800" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-outfit font-extrabold text-2xl text-[#163020]">
                    {lang === "pt" ? "E-mail confirmado! 🌱" : "Email confirmed! 🌱"}
                  </h3>
                  <p className="text-sm text-emerald-950/80 font-medium leading-relaxed max-w-sm mx-auto">
                    {lang === "pt"
                      ? "Sua conta Bloom está pronta. Agora é só entrar para começar."
                      : "Your Bloom account is ready. Now just log in to start."}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 bg-emerald-100/80 px-3.5 py-1.5 rounded-full text-xs font-semibold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 animate-ping" />
                  <span>
                    {lang === "pt" ? "Redirecionando para o login..." : "Redirecting to login..."}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleContinueToLogin}
                className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-[#163020] text-white hover:bg-emerald-950 font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>{lang === "pt" ? "Entrar na Bloom" : "Log in to Bloom"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : view === "confirmed_error" ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 space-y-4 shadow-sm text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
                  <span className="font-outfit font-extrabold text-2xl">⚠️</span>
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-outfit font-extrabold text-xl text-rose-900">
                    {lang === "pt"
                      ? "Link de confirmação inválido ou expirado"
                      : "Invalid or expired confirmation link"}
                  </h3>
                  <p className="text-sm text-rose-700 font-medium leading-relaxed">
                    {confirmationErrorMsg ||
                      (lang === "pt"
                        ? "Não foi possível confirmar seu e-mail com este link. Ele pode ter expirado ou já ter sido utilizado."
                        : "Unable to confirm your email with this link. It may have expired or already been used.")}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setView("signin");
                    navigate({ to: "/auth", replace: true });
                  }}
                  className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-[#163020] text-white hover:bg-emerald-950 font-bold text-sm shadow-md transition-colors cursor-pointer"
                >
                  <span>{lang === "pt" ? "Voltar para o Login" : "Back to Login"}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView("unconfirmed");
                    navigate({ to: "/auth", replace: true });
                  }}
                  className="w-full flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-foreground hover:bg-secondary/45 font-bold text-sm shadow-sm transition-all cursor-pointer"
                >
                  <span>
                    {lang === "pt" ? "Reenviar e-mail de confirmação" : "Resend confirmation email"}
                  </span>
                </button>
              </div>
            </div>
          ) : view === "signup" && !isInviteFlow ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-4 shadow-sm text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-amber-800 shadow-inner">
                  <ShieldCheck className="h-7 w-7 text-amber-800" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-outfit font-extrabold text-xl text-foreground">
                    {t.closedAlphaTag}
                  </h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-sm mx-auto">
                    {t.closedAlphaNotice}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setView("signin")}
                className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-[#163020] text-white hover:bg-emerald-950 font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>{t.backToLogin}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : view !== "unconfirmed" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {view === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t.nameLabel}</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      ref={nameInputRef}
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      className="pl-10 h-11 rounded-xl focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{t.emailLabel}</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    ref={emailInputRef}
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="pl-10 h-11 rounded-xl focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {view !== "reset" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t.passwordLabel}</Label>
                    {view === "signin" && (
                      <button
                        type="button"
                        onClick={() => setView("reset")}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        {t.forgotPassword}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      className="pl-10 h-11 rounded-xl focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {view === "signup" && (
                    <div className="mt-2 space-y-1.5 rounded-xl bg-secondary/40 p-3 text-xs font-semibold select-none">
                      <div className="flex items-center gap-2 transition-colors">
                        <span className="text-[10px]">{isLengthValid ? "✔️" : "❌"}</span>
                        <span className={isLengthValid ? "text-emerald-700" : "text-rose-600/80"}>
                          {t.reqLength}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 transition-colors">
                        <span className="text-[10px]">{isUppercaseValid ? "✔️" : "❌"}</span>
                        <span
                          className={isUppercaseValid ? "text-emerald-700" : "text-rose-600/80"}
                        >
                          {t.reqUppercase}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 transition-colors">
                        <span className="text-[10px]">{isLowercaseValid ? "✔️" : "❌"}</span>
                        <span
                          className={isLowercaseValid ? "text-emerald-700" : "text-rose-600/80"}
                        >
                          {t.reqLowercase}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 transition-colors">
                        <span className="text-[10px]">{isNumberValid ? "✔️" : "❌"}</span>
                        <span className={isNumberValid ? "text-emerald-700" : "text-rose-600/80"}>
                          {t.reqNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 transition-colors">
                        <span className="text-[10px]">{isSpecialValid ? "✔️" : "❌"}</span>
                        <span className={isSpecialValid ? "text-emerald-700" : "text-rose-600/80"}>
                          {t.reqSpecial}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {view === "signup" && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="confirmPassword">{t.confirmPasswordLabel}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t.confirmPasswordPlaceholder}
                      className="pl-10 h-11 rounded-xl focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold mt-1">
                      {isMatchValid ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-emerald-700">{t.reqMatch}</span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          <span className="text-rose-600">{t.passwordsDontMatch}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (view === "signup" && !isSignUpFormValid)}
                className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-[#163020] text-white hover:bg-emerald-950 font-bold text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading ? (
                  <span>{t.loadingText}</span>
                ) : (
                  <>
                    <span>
                      {view === "signin" && t.btnSignIn}
                      {view === "signup" && t.btnSignUp}
                      {view === "reset" && t.btnReset}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {(() => {
                const getEmailProviderInfo = (emailStr: string) => {
                  if (!emailStr) return null;
                  const domain = emailStr.split("@")[1]?.toLowerCase();
                  if (!domain) return null;

                  if (domain.includes("gmail.com")) {
                    return {
                      name: "Gmail",
                      url: "https://mail.google.com",
                    };
                  }
                  if (
                    domain.includes("outlook.com") ||
                    domain.includes("hotmail.com") ||
                    domain.includes("live.com") ||
                    domain.includes("outlook.com.br") ||
                    domain.includes("hotmail.com.br")
                  ) {
                    return {
                      name: "Outlook",
                      url: "https://outlook.live.com/mail/",
                    };
                  }
                  if (domain.includes("yahoo.com") || domain.includes("yahoo.com.br")) {
                    return {
                      name: "Yahoo Mail",
                      url: "https://mail.yahoo.com",
                    };
                  }
                  if (domain.includes("icloud.com")) {
                    return {
                      name: "iCloud Mail",
                      url: "https://www.icloud.com/mail/",
                    };
                  }
                  return {
                    name: lang === "pt" ? "E-mail" : "Email",
                    url: "mailto:",
                  };
                };

                const emailProvider = getEmailProviderInfo(confirmationEmail);

                return (
                  <>
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm text-center">
                      <div className="h-12 w-12 mx-auto rounded-full bg-[#8DA825]/10 flex items-center justify-center text-[#8DA825] animate-pulse">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-outfit font-bold text-xl text-[#33411B]">
                          {lang === "pt" ? "Quase lá! 🌱" : "Almost there! 🌱"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {confirmationEmail ? (
                            lang === "pt"
                              ? "Enviamos um e-mail de confirmação para:"
                              : "We sent a confirmation email to:"
                          ) : (
                            lang === "pt"
                              ? "Enviamos um e-mail de confirmação para o endereço usado durante o cadastro."
                              : "We sent a confirmation email to the address used during registration."
                          )}
                        </p>
                      </div>

                      {confirmationEmail && (
                        <div className="flex items-center gap-3 bg-[#33411B]/5 border border-[#33411B]/10 px-4 py-3 rounded-xl">
                          <div className="h-10 w-10 rounded-lg bg-[#33411B]/10 flex items-center justify-center text-[#33411B]">
                            <Mail className="h-5 w-5" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-[10px] text-muted-foreground font-semibold tracking-wide uppercase">
                              {lang === "pt" ? "E-mail de Confirmação" : "Confirmation Email"}
                            </p>
                            <p className="text-sm font-bold text-[#33411B] select-all break-all leading-tight">
                              {confirmationEmail}
                            </p>
                          </div>
                        </div>
                      )}

                      {confirmationEmail && (
                        <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                          {lang === "pt"
                            ? "Basta clicar no link enviado para ativar sua conta e começar a usar a Bloom."
                            : "Just click the link sent to activate your account and start using Bloom."}
                        </p>
                      )}

                      {!confirmationEmail && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {lang === "pt"
                            ? "Por favor, clique no link de confirmação enviado para o seu e-mail para ativar sua conta. Lembre-se de verificar a pasta de spam caso não encontre na caixa de entrada."
                            : "Please click the confirmation link sent to your email to activate your account. Don't forget to check your spam folder if it doesn't arrive in your inbox."}
                        </p>
                      )}
                    </div>

                    {/* Status banners */}
                    {resendStatus === "success" && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-semibold animate-in fade-in duration-200 text-center">
                        {lang === "pt" ? "✓ E-mail de confirmação enviado com sucesso." : "✓ Confirmation email sent successfully."}
                      </div>
                    )}

                    {resendStatus === "error" && (
                      <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-semibold space-y-1 animate-in fade-in duration-200 text-left">
                        <p>
                          {lang === "pt" 
                            ? "⚠️ Não foi possível enviar o e-mail de confirmação. Tente novamente." 
                            : "⚠️ Unable to send the confirmation email. Please try again."}
                        </p>
                        {resendErrorMessage && (
                          <p className="text-[10px] text-rose-600/90 font-mono font-normal">
                            {resendErrorMessage}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action buttons list */}
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleResendConfirmation}
                        disabled={loading || resendStatus === "sending" || cooldownTime > 0}
                        className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-[#33411B] text-white hover:bg-[#33411B]/90 font-bold text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resendStatus === "sending" ? (
                          <span>{lang === "pt" ? "Enviando..." : "Sending..."}</span>
                        ) : cooldownTime > 0 ? (
                          <span>
                            {lang === "pt" 
                              ? `Reenviar disponível em ${cooldownTime}s...` 
                              : `Resend available in ${cooldownTime}s...`}
                          </span>
                        ) : (
                          <>
                            <span>
                              {lang === "pt" ? "Reenviar e-mail de confirmação" : "Resend confirmation email"}
                            </span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>

                      {emailProvider && (
                        <a
                          href={emailProvider.url}
                          target={emailProvider.url.startsWith("http") ? "_blank" : "_self"}
                          rel="noopener noreferrer"
                          className="w-full flex h-11 items-center justify-center gap-2 rounded-xl border border-[#33411B] bg-white text-[#33411B] hover:bg-[#33411B]/5 font-bold text-sm shadow-sm transition-all cursor-pointer"
                        >
                          <span>
                            {lang === "pt" ? `Abrir ${emailProvider.name}` : `Open ${emailProvider.name}`}
                          </span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => setView("signin")}
                        className="w-full text-center text-sm font-semibold text-[#33411B]/80 hover:text-[#33411B] hover:underline bg-transparent py-2 transition-all cursor-pointer"
                      >
                        {lang === "pt" ? "Voltar para o Login" : "Back to Login"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Helper links to toggle views */}
          {view !== "unconfirmed" &&
            view !== "confirmed_success" &&
            view !== "confirmed_error" && (
            <div className="text-center pt-2">
              {view === "signin" && (
                <button
                  onClick={() => setView("signup")}
                  className="text-sm font-semibold text-[#163020] hover:underline cursor-pointer"
                >
                  {t.noAccount}
                </button>
              )}
              {view === "signup" && (
                <button
                  onClick={() => setView("signin")}
                  className="text-sm font-semibold text-[#163020] hover:underline cursor-pointer"
                >
                  {t.haveAccount}
                </button>
              )}
              {view === "reset" && (
                <button
                  onClick={() => setView("signin")}
                  className="text-sm font-semibold text-[#163020] hover:underline cursor-pointer"
                >
                  {t.backToLogin}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
