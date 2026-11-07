import { LoginForm } from '@/features/auth/login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">Autonova</p>
      <h1 className="mt-1 text-2xl font-semibold text-navy">Sign in to CRM</h1>
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <LoginForm />
      </div>
    </main>
  );
}
