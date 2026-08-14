export interface FcxGeneratedView {
  _generated?: boolean;
  _generate(): void;
}

export function initializeFcxStandaloneView(view: FcxGeneratedView): void {
  if (!view._generated) {
    view._generate();
  }
}

export function createFcxViewSafely<T>(
  createView: () => T,
  createFailureView: (error: unknown) => T,
  reportError: (error: unknown) => void,
): T {
  try {
    return createView();
  } catch (error) {
    reportError(error);
    return createFailureView(error);
  }
}
