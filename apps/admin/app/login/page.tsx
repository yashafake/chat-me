import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-[82vh] items-center lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden pr-12 lg:block">
        <div className="max-w-xl">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
            Local-first support stack
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-tight text-white">
            chat-me
            <span className="block bg-gradient-to-r from-aurora via-cyan-300 to-gold bg-clip-text text-transparent">
              российский self-hosted chat backend
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Операторская админка для нескольких сайтов и storefront-проектов с хранением переписки,
            метаданных и служебных действий только в локальном PostgreSQL-контуре.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-md rounded-[34px] border border-white/10 bg-white/5 p-7 shadow-glass backdrop-blur lg:mx-0">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Operator Login</div>
          <h2 className="mt-3 text-3xl font-semibold text-white">Вход в админку</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Secure cookie session, локальная база и безопасные служебные нотификации без передачи ПДн наружу.
          </p>
        </div>
        <LoginForm />
      </section>
    </div>
  );
}
