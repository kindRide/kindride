import type { ReactNode } from "react";

// Web stub — stripe-react-native is native-only.
export default function StripeWrapper({
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return <>{children}</>;
}
