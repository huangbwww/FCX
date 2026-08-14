import type { SolveRequest, SolveResponse } from "../types/backend";
import { postJsonCompat } from "./http";

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly onPostError: (error: unknown) => void,
  ) {}

  solve(request: SolveRequest): Promise<SolveResponse> {
    return postJsonCompat<SolveResponse>(
      `${this.baseUrl}/solve`,
      JSON.stringify(request),
      { onError: this.onPostError },
    );
  }
}
