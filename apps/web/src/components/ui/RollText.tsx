/** Label that rolls up to an identical copy when its group is hovered, as on the arrow buttons. */
export default function RollText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`relative block h-[20px] overflow-hidden ${className}`}>
      <span className="flex flex-col transition-transform duration-500 ease-axion group-hover:-translate-y-1/2 motion-reduce:transition-none">
        <span className="block h-[20px] whitespace-nowrap leading-[20px]">{text}</span>
        <span className="block h-[20px] whitespace-nowrap leading-[20px]" aria-hidden="true">
          {text}
        </span>
      </span>
    </span>
  )
}
