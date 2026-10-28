import ErrorState from '@/components/errors/ErrorState';

export default function NotFound() {
  return <ErrorState code={404} />;
}
