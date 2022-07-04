import { verifyMessage } from '@ethersproject/wallet';

export function isSignatureValid({
  owner,
  message,
  signature,
}: {
  owner: string;
  message: string;
  signature: string;
}): boolean {
  const addressFromSignature = verifyMessage(message, signature);
  return owner.toLowerCase() === addressFromSignature.toLowerCase();
}
