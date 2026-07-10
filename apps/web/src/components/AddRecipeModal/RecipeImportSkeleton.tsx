import { Image as ImageIcon } from 'react-feather'

// Shown in place of the import form while a recipe is streaming in. Mirrors the
// layout of EditableRecipeView so the transition into the real content, once it
// arrives, doesn't jump.

const Bone = ({
  className = '',
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) => (
  <div
    className={`rounded bg-zinc-100 animate-pulse ${className}`}
    style={style}
  />
)

const INGREDIENT_BONE_WIDTHS = ['92%', '78%', '85%', '64%', '80%']

const RecipeImportSkeleton = ({ progress }: { progress: number }) => (
  <div className="relative mt-4 border-t border-zinc-200 pt-4">
    <div className="flex gap-3 items-start mb-2">
      <Bone className="w-16 h-16 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-2 pt-1">
        <Bone className="h-5 w-3/4" />
        <Bone className="h-5 w-1/2" />
      </div>
    </div>

    <div className="flex gap-1.5 mb-3">
      <Bone className="h-6 w-16 rounded-full" />
      <Bone className="h-6 w-20 rounded-full" />
    </div>

    <div className="flex gap-2 flex-wrap mb-4">
      <Bone className="h-6 w-20 rounded-full" />
      <Bone className="h-6 w-28 rounded-full" />
      <Bone className="h-6 w-24 rounded-full" />
      <Bone className="h-6 w-20 rounded-full" />
      <Bone className="h-6 w-24 rounded-full" />
    </div>

    <Bone className="h-3 w-24 mb-2" />
    <ul className="space-y-2 mb-4">
      {INGREDIENT_BONE_WIDTHS.map((w, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-zinc-300 mt-1 shrink-0">·</span>
          <Bone className="h-4" style={{ width: w }} />
        </li>
      ))}
    </ul>

    <Bone className="h-3 w-16 mb-2" />
    <ol className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-zinc-300 font-medium shrink-0">{i + 1}.</span>
          <div className="flex-1 flex flex-col gap-1.5">
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-3/5" />
          </div>
        </li>
      ))}
    </ol>

    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-20 h-20 rounded-2xl bg-white shadow-lg border border-zinc-100 flex flex-col items-center justify-center gap-2.5">
        <ImageIcon className="w-5 h-5 text-zinc-400" />
        <div className="w-12 h-1 rounded-full bg-zinc-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  </div>
)

export default RecipeImportSkeleton
