/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./index.css";

import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import MemberDetailPage from "./pages/MemberDetailPage";
import FamiliesPage from "./pages/FamiliesPage";
import FamilyDetailPage from "./pages/FamilyDetailPage";
import ServicesPage from "./pages/ServicesPage";
import ServiceDetailPage from "./pages/ServiceDetailPage";
import AttendancePage from "./pages/AttendancePage";
import AttendanceDetailPage from "./pages/AttendanceDetailPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";

render(
  () => (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={AppLayout}>
        <Route path="/" component={DashboardPage} />
        <Route path="/members" component={MembersPage} />
        <Route path="/members/:id" component={MemberDetailPage} />
        <Route path="/families" component={FamiliesPage} />
        <Route path="/families/:id" component={FamilyDetailPage} />
        <Route path="/services" component={ServicesPage} />
        <Route path="/services/:id" component={ServiceDetailPage} />
        <Route path="/attendance" component={AttendancePage} />
        <Route path="/attendance/:serviceId" component={AttendanceDetailPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/settings" component={SettingsPage} />
      </Route>
    </Router>
  ),
  document.getElementById("root")!,
);
