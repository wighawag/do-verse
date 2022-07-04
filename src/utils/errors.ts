export function formatError(e: any): string {
  const errorMessage =
    e.data?.message ||
    (e.data?.data
      ? JSON.stringify(e.data?.data)
      : e.message
      ? e.message
      : JSON.stringify(e)); //(e.toString ? e.toString() : ;
  return errorMessage;
}
