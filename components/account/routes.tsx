"use client";

import { useParams } from "next/navigation";
import { AccountFrame } from "./account-frame";
import { AddressesView } from "./addresses";
import { InvoiceView } from "./invoice-view";
import { OrderDetailView } from "./order-detail";
import { AccountOverview, OrdersList } from "./overview";
import { ReturnForm } from "./return-form";
import { SettingsView } from "./settings";
import { AlertsView, ClubView } from "./club-views";
import { WearTheHoodView } from "./wear-the-hood";

/** Client entry points for the /account routes (dynamic params read on the client). */
export function AccountHome() {
  return (
    <AccountFrame title="My account">
      <AccountOverview />
    </AccountFrame>
  );
}

export function AccountOrders() {
  return (
    <AccountFrame title="Orders & returns">
      <OrdersList />
    </AccountFrame>
  );
}

export function AccountOrder() {
  const { number } = useParams<{ number: string }>();
  return (
    <AccountFrame title="Order details">
      <OrderDetailView number={number} />
    </AccountFrame>
  );
}

export function AccountReturn() {
  const { number } = useParams<{ number: string }>();
  return (
    <AccountFrame title="Return or exchange">
      <ReturnForm number={number} />
    </AccountFrame>
  );
}

export function AccountInvoice() {
  const { number } = useParams<{ number: string }>();
  return (
    <AccountFrame title="Invoice">
      <InvoiceView number={number} />
    </AccountFrame>
  );
}

export function AccountAddresses() {
  return (
    <AccountFrame title="Addresses">
      <AddressesView />
    </AccountFrame>
  );
}

export function AccountSettings() {
  return (
    <AccountFrame title="Settings & privacy">
      <SettingsView />
    </AccountFrame>
  );
}

export function AccountClub() {
  return (
    <AccountFrame title="Alpha Club">
      <ClubView />
    </AccountFrame>
  );
}

export function AccountAlerts() {
  return (
    <AccountFrame title="Alerts">
      <AlertsView />
    </AccountFrame>
  );
}

export function AccountWearTheHood() {
  return (
    <AccountFrame title="#WearTheHood">
      <WearTheHoodView />
    </AccountFrame>
  );
}
