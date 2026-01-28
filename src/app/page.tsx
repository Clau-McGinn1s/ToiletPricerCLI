export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900 p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
          ToiletAPI
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
          Web scraping tool with REST API for bathroom product data from Home Depot Mexico
        </p>

        <div className="flex gap-4 justify-center mb-12">
          <a
            href="/api/toilet"
            className="inline-block bg-blue-600 hover:bg-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to API &rarr;
          </a>
          <a
            href="/demo"
            className="inline-block bg-zinc-700 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            View Demo &rarr;
          </a>
        </div>

        <div className="text-left bg-white dark:bg-zinc-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
            Quick Start
          </h2>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">
              CLI Commands
            </h3>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-4 font-mono text-sm text-zinc-800 dark:text-zinc-200 space-y-2">
              <p><span className="text-blue-600 dark:text-blue-400">#</span> Fresh setup (drop db, scrape, save)</p>
              <p>npm run cli -- set-up:fresh</p>
              <p className="mt-3"><span className="text-blue-600 dark:text-blue-400">#</span> Test mode with limit</p>
              <p>npm run cli -- set-up:fresh -t -l 5</p>
              <p className="mt-3"><span className="text-blue-600 dark:text-blue-400">#</span> Start the server</p>
              <p>npm run cli -- run-server</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">
              API Endpoints
            </h3>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-4 font-mono text-sm text-zinc-800 dark:text-zinc-200 space-y-2">
              <p><span className="text-green-600 dark:text-green-400">GET</span> /api/toilet</p>
              <p className="text-zinc-500 dark:text-zinc-500 text-xs ml-4">?type=wc|sink|faucet|shower-head</p>
              <p className="text-zinc-500 dark:text-zinc-500 text-xs ml-4">?id=1&amp;color=blanco&amp;match=alargado</p>
              <p className="mt-2"><span className="text-green-600 dark:text-green-400">GET</span> /api/toilet/links</p>
              <p className="text-zinc-500 dark:text-zinc-500 text-xs ml-4">?type=wc</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-8">
          See README.md for full documentation
        </p>
      </div>
    </div>
  );
}
