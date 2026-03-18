import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-[82vh] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="chatme-desktop-only-block pr-10">
        <div className="max-w-2xl">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
            Operator workspace
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-tight text-white">
            chat-me
            <span className="mt-3 block text-2xl font-medium leading-10 text-slate-200">
              понятная операторская консоль для локального чата
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Очередь обращений, переписка, контекст посетителя, внутренние заметки и PWA-уведомления
            в одном интерфейсе без вывода данных во внешний SaaS.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Очередь</div>
              <div className="mt-3 text-lg font-semibold text-white">Что требует ответа</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                В списке сразу видно проект, статус, последнее сообщение и приоритет обработки.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Контекст</div>
              <div className="mt-3 text-lg font-semibold text-white">Источник и заметки</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                История, страница входа, контакты и внутренние договоренности лежат рядом с чатом.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">PWA</div>
              <div className="mt-3 text-lg font-semibold text-white">Работа с телефона</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Установи админку на iPhone как приложение и включи safe push прямо после входа.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-md rounded-[34px] border border-white/10 bg-white/5 p-7 shadow-glass backdrop-blur lg:mx-0">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Operator Login</div>
          <h2 className="mt-3 text-3xl font-semibold text-white">Вход в консоль</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Secure cookie session, локальная база и безопасные служебные уведомления без передачи ПДн наружу.
          </p>
        </div>
        <LoginForm />
      </section>
    </div>
  );
}
