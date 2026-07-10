const MOBILE_SKELETON_ROWS = [1, 2, 3]
const DESKTOP_SKELETON_ROWS = [1, 2, 3, 4, 5]

const RecipesLoadingSkeleton = () => (
  <>
    <div className="md:hidden flex flex-col gap-3 px-4 mt-4">
      {MOBILE_SKELETON_ROWS.map((i) => (
        <div key={i} className="h-20 rounded-xl bg-zinc-100 animate-pulse" />
      ))}
    </div>
    <div className="hidden md:block px-4 mt-4">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-100 overflow-hidden">
        {DESKTOP_SKELETON_ROWS.map((i) => (
          <div
            key={i}
            className="flex gap-3 items-center px-4 py-3 border-b border-zinc-100"
          >
            <div className="w-4 h-4 rounded bg-zinc-100 animate-pulse shrink-0" />
            <div className="w-12 h-12 rounded-lg bg-zinc-100 animate-pulse shrink-0" />
            <div className="flex-1 h-4 rounded bg-zinc-100 animate-pulse" />
            <div className="w-16 h-4 rounded bg-zinc-100 animate-pulse" />
            <div className="w-16 h-4 rounded bg-zinc-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  </>
)

export default RecipesLoadingSkeleton
