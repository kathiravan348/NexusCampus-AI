import { Route, Routes } from "react-router";
import { TicketDetail } from "./TicketDetail";
import { TicketList } from "./TicketList";

/** P09 Support desk: `/support` lists tickets, `/support/:ticketId` shows one. */
export default function SupportPage() {
  return (
    <Routes>
      <Route index element={<TicketList />} />
      <Route path=":ticketId" element={<TicketDetail />} />
    </Routes>
  );
}
