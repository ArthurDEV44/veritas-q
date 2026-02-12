const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export { API_URL };

/**
 * Get auth headers with Bearer token from Clerk
 * @param getToken - Clerk's getToken function from useAuth()
 * @returns Headers object with Authorization: Bearer <token>
 * @throws Error if no token is available
 */
export async function getAuthHeaders(
  getToken: () => Promise<string | null>
): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}
