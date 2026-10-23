import type {
  AssetLoan,
  AssetMaintenance,
  FacilityBooking,
  FacilityResource,
  InventoryAsset,
} from '@tatagereja/shared';
import type {
  AssetLoanRow,
  AssetMaintenanceRow,
  FacilityBookingRow,
  FacilityResourceRow,
  InventoryAssetRow,
  PersonRow,
} from '../../db/schema';
import { toPersonSummary } from '../../serializers';

export const toFacilityResource = (
  row: FacilityResourceRow,
  extras: Pick<FacilityResource, 'currentBooking' | 'nextBooking'>,
): FacilityResource => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  description: row.description,
  location: row.location,
  capacity: row.capacity,
  features: Array.isArray(row.features) ? row.features : [],
  photoUrl: row.photoUrl,
  color: row.color,
  requiresApproval: row.requiresApproval,
  isActive: row.isActive,
  availableNow: row.isActive && !extras.currentBooking,
  currentBooking: extras.currentBooking,
  nextBooking: extras.nextBooking,
});

export const toFacilityBooking = (
  row: FacilityBookingRow,
  extras: {
    resourceName: string;
    resourceColor: string | null;
    groupName: string | null;
    requesterName: string | null;
    deciderName: string | null;
    skippedDates: string[];
    nextOccurrence: FacilityBooking['nextOccurrence'];
    /** Notes are for the requester and managers only. */
    showNotes: boolean;
  },
): FacilityBooking => ({
  id: row.id,
  resourceId: row.resourceId,
  resourceName: extras.resourceName,
  resourceColor: extras.resourceColor,
  title: row.title,
  purpose: row.purpose,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  recurrence: row.recurrence,
  recurrenceUntil: row.recurrenceUntil,
  skippedDates: extras.skippedDates,
  status: row.status,
  expectedAttendees: row.expectedAttendees,
  groupId: row.groupId,
  groupName: extras.groupName,
  eventId: row.eventId,
  requestedBy: row.requestedBy,
  requesterName: extras.requesterName,
  decidedAt: row.decidedAt,
  deciderName: extras.deciderName,
  decisionNote: extras.showNotes ? row.decisionNote : null,
  cancelledAt: row.cancelledAt,
  notes: extras.showNotes ? row.notes : null,
  nextOccurrence: extras.nextOccurrence,
  createdAt: row.createdAt,
});

export const toInventoryAsset = (
  row: InventoryAssetRow,
  extras: {
    custodian: PersonRow | null;
    resourceName: string | null;
    currentLoan: {
      id: string;
      borrowerName: string;
      dueDate: string | null;
      isOverdue: boolean;
    } | null;
    nextMaintenanceDate: string | null;
  },
): InventoryAsset => ({
  id: row.id,
  code: row.code,
  name: row.name,
  category: row.category,
  description: row.description,
  resourceId: row.resourceId,
  resourceName: extras.resourceName,
  location: row.location,
  condition: row.condition,
  status: row.status,
  acquisitionDate: row.acquisitionDate,
  acquisitionValue: row.acquisitionValue,
  custodian: extras.custodian ? toPersonSummary(extras.custodian) : null,
  serialNumber: row.serialNumber,
  photoUrl: row.photoUrl,
  notes: row.notes,
  currentLoanId: extras.currentLoan?.id ?? null,
  currentLoan: extras.currentLoan
    ? {
        borrowerName: extras.currentLoan.borrowerName,
        dueDate: extras.currentLoan.dueDate,
        isOverdue: extras.currentLoan.isOverdue,
      }
    : null,
  nextMaintenanceDate: extras.nextMaintenanceDate,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toAssetLoan = (
  row: AssetLoanRow,
  extras: {
    assetName: string;
    assetCode: string;
    borrower: PersonRow | null;
    groupName: string | null;
    isOverdue: boolean;
  },
): AssetLoan => ({
  id: row.id,
  assetId: row.assetId,
  assetName: extras.assetName,
  assetCode: extras.assetCode,
  borrower: extras.borrower ? toPersonSummary(extras.borrower) : null,
  borrowerName: row.borrowerName,
  groupId: row.groupId,
  groupName: extras.groupName,
  checkedOutAt: row.checkedOutAt,
  dueDate: row.dueDate,
  returnedAt: row.returnedAt,
  conditionOut: row.conditionOut,
  conditionIn: row.conditionIn,
  notes: row.notes,
  isOverdue: extras.isOverdue,
});

export const toAssetMaintenance = (
  row: AssetMaintenanceRow,
  createdByName: string | null,
): AssetMaintenance => ({
  id: row.id,
  assetId: row.assetId,
  date: row.date,
  kind: row.kind,
  description: row.description,
  cost: row.cost,
  performedBy: row.performedBy,
  nextDueDate: row.nextDueDate,
  createdByName,
  createdAt: row.createdAt,
});
