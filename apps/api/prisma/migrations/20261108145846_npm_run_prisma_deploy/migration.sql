/*
  Warnings:

  - You are about to drop the `sla_approval_workflows` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sla_approvals` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sla_documents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sla_metrics_validations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sla_review_feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sla_test_evidence` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "sla_approval_workflows" DROP CONSTRAINT "sla_approval_workflows_document_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_approval_workflows" DROP CONSTRAINT "sla_approval_workflows_submitted_by_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_approvals" DROP CONSTRAINT "sla_approvals_approver_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_approvals" DROP CONSTRAINT "sla_approvals_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_documents" DROP CONSTRAINT "sla_documents_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_metrics_validations" DROP CONSTRAINT "sla_metrics_validations_document_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_review_feedback" DROP CONSTRAINT "sla_review_feedback_reviewer_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_review_feedback" DROP CONSTRAINT "sla_review_feedback_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_test_evidence" DROP CONSTRAINT "sla_test_evidence_document_id_fkey";

-- DropTable
DROP TABLE "sla_approval_workflows";

-- DropTable
DROP TABLE "sla_approvals";

-- DropTable
DROP TABLE "sla_documents";

-- DropTable
DROP TABLE "sla_metrics_validations";

-- DropTable
DROP TABLE "sla_review_feedback";

-- DropTable
DROP TABLE "sla_test_evidence";

-- DropEnum
DROP TYPE "SLADocumentStatus";

-- DropEnum
DROP TYPE "SLAFeedbackType";

-- DropEnum
DROP TYPE "SLAIncidentSeverity";

-- DropEnum
DROP TYPE "SLASignatureType";

-- DropEnum
DROP TYPE "SLAWorkflowStatus";
