// Route table. To add a page: create it under src/pages, add a route here and an entry in nav.ts.

import { Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";
import { DocumentsPage } from "@/pages/documents/DocumentsPage";
import { DocumentDetailPage } from "@/pages/documents/DocumentDetailPage";
import { RequirementsPage } from "@/pages/requirements/RequirementsPage";
import { RequirementDetailPage } from "@/pages/requirements/RequirementDetailPage";
import { EvidenceGraphPage } from "@/pages/graph/EvidenceGraphPage";
import { FindingsPage } from "@/pages/findings/FindingsPage";
import { AlertsPage } from "@/pages/findings/AlertsPage";
import { SimulatePage } from "@/pages/simulate/SimulatePage";
import { ActionsPage } from "@/pages/actions/ActionsPage";
import { WorkflowPage } from "@/pages/actions/WorkflowPage";
import { ReportPage } from "@/pages/report/ReportPage";

export const ROUTES: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "documents/:id", element: <DocumentDetailPage /> },
      { path: "requirements", element: <RequirementsPage /> },
      { path: "requirements/:id", element: <RequirementDetailPage /> },
      { path: "graph", element: <EvidenceGraphPage /> },
      { path: "findings", element: <FindingsPage /> },
      { path: "findings/alerts", element: <AlertsPage /> },
      { path: "simulate", element: <SimulatePage /> },
      { path: "actions", element: <ActionsPage /> },
      { path: "actions/workflow", element: <WorkflowPage /> },
      { path: "report", element: <ReportPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
