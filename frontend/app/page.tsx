export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-blue-100 bg-white p-10 shadow-sm">
        <p className="mb-3 text-sm font-semibold tracking-[0.24em] text-blue-600">
          LITTLE BLUE BOOK
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">
          小蓝书
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
          Web
          项目工程基础已初始化。当前页面仅用于验证开发、测试与构建流程，不代表最终产品视觉设计。
        </p>
      </section>
    </main>
  );
}
