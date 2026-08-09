import { Suspense } from 'react';
import { AssistantClient } from './AssistantClient';

/**
 * /app/assistant — standalone copilot page.
 *
 * Server component shell; the interactive surface (chat + threads drawer +
 * URL binding) lives in AssistantClient. Suspense boundary is required
 * because AssistantClient reads `useSearchParams()` for the ?t= binding.
 */
export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantClient />
    </Suspense>
  );
}
