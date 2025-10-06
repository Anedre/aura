// app/(authed)/template.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
