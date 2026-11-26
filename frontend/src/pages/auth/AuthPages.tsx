import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link as RouterLink,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { errorMessage } from "@/api/client";
import { authApi, joinApi } from "@/api/endpoints";
import type { JoinInfo, User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { ThemeToggle } from "@/components/Layout";
import { LanguageMenu, t } from "@/i18n";
import { PHONE_HINT, phoneError } from "@/format";
import { passwordHint, passwordRule } from "@/password";

const RESEND_SECONDS = 60;

/** "Send code" button + code input. The emailed code proves that the address exists and belongs to the user. */
function EmailCodeField({
  email,
  code,
  onCode,
}: {
  email: string;
  code: string;
  onCode: (code: string) => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const normalized = email.trim().toLowerCase();
  const sent = sentTo === normalized; // editing the email after sending asks for a new code
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.sendCode(normalized);
      setSentTo(normalized);
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <TextField
          label={t("Code from email")}
          required
          disabled={!sent}
          value={code}
          onChange={(e) =>
            onCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          autoComplete="one-time-code"
          sx={{ flex: 1 }}
          helperText={
            sent
              ? t("Sent to {0}. Check the spam folder too.", sentTo)
              : t("We email a 6-digit code to confirm the address")
          }
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6 } }}
        />
        <Button
          variant="outlined"
          onClick={send}
          disabled={
            busy || !/^\S+@\S+\.\S+$/.test(normalized) || (sent && wait > 0)
          }
          sx={{ height: 56, minWidth: 120, whiteSpace: "nowrap" }}
        >
          {sent ? (wait > 0 ? t("Resend ({0})", wait) : t("Resend")) : t("Send code")}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const error = phoneError(value);
  return (
    <TextField
      label={t("Phone")}
      type="tel"
      value={value}
      onChange={onChange}
      autoComplete="tel"
      placeholder={PHONE_HINT}
      error={!!error}
      helperText={error ?? t("Optional")}
    />
  );
}

/** Checks shared by both sign-up forms. Returns an error message or null. */
function signUpError(form: {
  code: string;
  phone: string;
  password: string;
  confirm: string;
}) {
  if (!/^\d{6}$/.test(form.code))
    return t("Enter the 6-digit code from the email");
  const weak = passwordHint(form.password);
  if (weak) return t("Password: {0}", weak.toLowerCase());
  if (form.password !== form.confirm) return t("Passwords do not match");
  return phoneError(form.phone);
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 4,
        bgcolor: "background.default",
      }}
    >
      <Box sx={{ position: "fixed", top: 8, right: 8 }}>
        <LanguageMenu />
        <ThemeToggle />
      </Box>
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        <Stack
          component={RouterLink}
          to="/"
          direction="row"
          spacing={1}
          sx={{
            mb: 3,
            justifyContent: "center",
            alignItems: "center",
            color: "text.primary",
            textDecoration: "none",
          }}
        >
          <Box
            component="img"
            src="/favicon.svg"
            alt=""
            sx={{ width: 36, height: 36 }}
          />
          <Typography variant="h5">KeyFive WMS</Typography>
        </Stack>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" component="h1">
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, mb: 1 }}
              >
                {subtitle}
              </Typography>
            )}
            <Box sx={{ mt: 2 }}>{children}</Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("Sign in")} subtitle={t("Customer account of the KeyFive shop.")}>
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t("Email")}
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          size="medium"
        />
        <TextField
          label={t("Password")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          size="medium"
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy}
          startIcon={<LockOutlinedIcon />}
        >
          {t("Sign in")}
        </Button>
        <Typography variant="body2" sx={{ textAlign: "center" }}>
          {t("New customer?")}{" "}
          <Link component={RouterLink} to="/signup">
            {t("Create an account")}
          </Link>
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          {t("Admin or Manager?")}{" "}
          <Link component={RouterLink} to="/staff/login">
            {t("Staff sign in")}
          </Link>{" "}
          {t("(confirmed on your work phone). Workers use only the KeyFive Staff app.")}
        </Typography>
      </Stack>
    </AuthCard>
  );
}

export function SignUpPage() {
  const { acceptTokens } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    code: "",
    phone: "",
    address: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = signUpError(form);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const pair = await authApi.register({
        email: form.email,
        code: form.code,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone || undefined,
        address: form.address || undefined,
      });
      acceptTokens(pair); // customers are signed in right away
      navigate("/catalog", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={t("Create a customer account")}
      subtitle={t("Shop household goods and track your orders.")}
    >
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label={t("Full name")}
          required
          value={form.full_name}
          onChange={set("full_name")}
          autoComplete="name"
        />
        <TextField
          label={t("Email")}
          type="email"
          required
          value={form.email}
          onChange={set("email")}
          autoComplete="email"
        />
        <EmailCodeField
          email={form.email}
          code={form.code}
          onCode={(code) => setForm((f) => ({ ...f, code }))}
        />
        <PhoneField value={form.phone} onChange={set("phone")} />
        <TextField
          label={t("Delivery address")}
          value={form.address}
          onChange={set("address")}
          autoComplete="street-address"
          placeholder={t("City, street, building, apartment")}
        />
        <TextField
          label={t("Password")}
          type="password"
          required
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
          error={!!form.password && !!passwordHint(form.password)}
          helperText={(form.password && passwordHint(form.password)) || passwordRule()}
        />
        <TextField
          label={t("Repeat password")}
          type="password"
          required
          value={form.confirm}
          onChange={set("confirm")}
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {t("Sign up")}
        </Button>
        <Typography variant="body2" sx={{ textAlign: "center" }}>
          {t("Already have an account?")}{" "}
          <Link component={RouterLink} to="/login">
            {t("Sign in")}
          </Link>
        </Typography>
      </Stack>
    </AuthCard>
  );
}

/**
 * The page of an invitation link (/join/<token>): the person types first and last name, the work email, phone and
 * a password; the account is made at once in the link's role and team, with an employee id. The link works once.
 */
export function JoinPage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [joined, setJoined] = useState<User | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    joinApi.info(token).then(setInfo, (e) => setGone(errorMessage(e)));
  }, [token]);

  const weak = form.password ? passwordHint(form.password) : null;
  const problem =
    !form.first_name.trim() || !form.last_name.trim()
      ? t("Enter your first and last name")
      : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
        ? t("Enter your work email")
        : !form.phone.trim() || phoneError(form.phone)
          ? (phoneError(form.phone) ?? t("Enter your phone number"))
          : passwordHint(form.password)
            ? t("Password: {0}", passwordHint(form.password)!.toLowerCase())
            : form.password !== form.confirm
              ? t("The passwords do not match")
              : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      setJoined(
        await joinApi.join(token, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <AuthCard title={t("Invitation link")}>
        <Alert severity="warning">{gone}</Alert>
      </AuthCard>
    );
  }
  if (joined) {
    return (
      <AuthCard title={t("Welcome, {0}!", joined.full_name)}>
        <Stack spacing={2}>
          <Alert severity="success">
            {t("Your employee ID:")} <b>{joined.employee_code}</b>. {t("Keep it: you may be asked for it at work.")}
          </Alert>
          <Typography>
            {t(
              "Next: install the KeyFive Staff app on your work phone and sign in with {0} and your password. " +
                "Your Manager approves the phone, then you can work.",
              joined.email,
            )}
          </Typography>
        </Stack>
      </AuthCard>
    );
  }
  if (!info) {
    return (
      <AuthCard title={t("Invitation link")}>
        <Typography color="text.secondary">{t("Checking the link…")}</Typography>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={info.role === "MANAGER" ? t("Join KeyFive as a Manager") : t("Join KeyFive")}
      subtitle={
        (info.team_name ? t("{0} invites you to {1}.", info.invited_by, info.team_name) : t("{0} invites you.", info.invited_by)) +
        " " + t("The link works once.")
      }
    >
      <Stack component="form" spacing={2} onSubmit={submit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={2}>
          <TextField label={t("First name")} required fullWidth value={form.first_name} onChange={set("first_name")} autoComplete="given-name" />
          <TextField label={t("Last name")} required fullWidth value={form.last_name} onChange={set("last_name")} autoComplete="family-name" />
        </Stack>
        <TextField label={t("Work email")} type="email" required value={form.email} onChange={set("email")} autoComplete="email"
          helperText={t("You sign in to the KeyFive Staff app with it")} />
        <TextField label={t("Phone")} type="tel" required value={form.phone} onChange={set("phone")} autoComplete="tel"
          placeholder={PHONE_HINT} error={!!form.phone && !!phoneError(form.phone)} helperText={(form.phone && phoneError(form.phone)) || " "} />
        <TextField label={t("Password")} type="password" required value={form.password} onChange={set("password")}
          autoComplete="new-password" error={!!weak} helperText={weak ?? passwordRule()} />
        <TextField label={t("Repeat password")} type="password" required value={form.confirm} onChange={set("confirm")}
          autoComplete="new-password" error={!!form.confirm && form.confirm !== form.password}
          helperText={form.confirm && form.confirm !== form.password ? t("The passwords do not match") : " "} />
        <Button type="submit" variant="contained" size="large" disabled={busy || !!problem}>
          {t("Join")}
        </Button>
      </Stack>
    </AuthCard>
  );
}

export function ErrorPage({ code }: { code: 403 | 404 }) {
  return (
    <AuthCard title={code === 403 ? t("Access denied") : t("Page not found")}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <Typography variant="h2" color="text.secondary">
          {code}
        </Typography>
        <Typography color="text.secondary">
          {code === 403
            ? t("You do not have access to this page.")
            : t("This page does not exist.")}
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          {t("Go to start page")}
        </Button>
      </Stack>
    </AuthCard>
  );
}
