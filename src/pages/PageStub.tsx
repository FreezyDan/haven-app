import { motion } from 'framer-motion';

interface PageStubProps {
  title: string;
  note?: string;
}

/** Temporary placeholder until the page agent implements this route. */
export default function PageStub({ title, note }: PageStubProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-haven-border bg-white px-6 py-16 text-center shadow-card"
    >
      <h2 className="text-2xl font-medium text-haven-text">{title}</h2>
      <p className="mt-2 text-sm text-haven-text-muted">{note ?? 'This space is being gently prepared.'}</p>
    </motion.div>
  );
}
