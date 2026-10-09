export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
