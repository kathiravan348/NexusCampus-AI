import { Route, Routes } from "react-router";
import { AccountDetail } from "./AccountDetail";
import { AccountsList } from "./AccountsList";

/** P01 Accounts & CRM: `/accounts` lists, `/accounts/:accountId` shows one account. */
export default function AccountsPage() {
  return (
    <Routes>
      <Route index element={<AccountsList />} />
      <Route path=":accountId" element={<AccountDetail />} />
    </Routes>
  );
}
