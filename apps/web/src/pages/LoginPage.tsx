import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, CardBody, Input } from "@heroui/react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setEmail("demo@demo.com");
    setPassword("demo");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">PlateKeeper</h1>
          <p className="text-default-500 mt-1 text-sm">Your personal recipe library</p>
        </div>

        <Card>
          <CardBody className="gap-4 p-6">
            <h2 className="text-xl font-semibold">Sign in</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                label="Email"
                type="email"
                value={email}
                onValueChange={setEmail}
                autoComplete="email"
                isRequired
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onValueChange={setPassword}
                autoComplete="current-password"
                isRequired
              />

              {error && <p className="text-danger text-sm">{error}</p>}

              <Button color="primary" type="submit" isLoading={loading} fullWidth>
                Sign in
              </Button>
            </form>

            <div className="flex items-center gap-2 text-xs text-default-400">
              <div className="flex-1 h-px bg-divider" />
              <span>or</span>
              <div className="flex-1 h-px bg-divider" />
            </div>

            <div className="flex gap-2">
              <Button variant="flat" fullWidth onPress={fillDemo}>
                Use demo account
              </Button>
              <Button variant="flat" fullWidth onPress={() => { setEmail("alt@demo.com"); setPassword("demo"); }}>
                Use demo alt
              </Button>
            </div>

            <p className="text-center text-sm text-default-500">
              No account?{" "}
              <Link to="/register" className="text-primary font-medium">
                Create one
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
