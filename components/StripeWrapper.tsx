import { StripeProvider } from "@stripe/stripe-react-native";
import type { ReactNode } from "react";

export default function StripeWrapper({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return (
    <StripeProvider publishableKey={publishableKey}>{children}</StripeProvider>
  );
}
