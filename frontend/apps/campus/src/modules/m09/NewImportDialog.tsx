import { ImportJobInputSchema, type ImportEntity, type ImportSourceFormat } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useCreateImportJob } from "@nexus/services";
import { Button, cn, Field, getDescribedBy, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useOnline } from "../../app/RouteGuard";
import { IMPORT_ENTITY_KEY, IMPORT_FORMAT_KEY } from "./ImportJobView";

const ENTITIES: readonly ImportEntity[] = [
  "learner",
  "guardian",
  "staff",
  "enrolment",
  "fee_balance",
  "mark",
];

function detectFormat(fileName: string): ImportSourceFormat | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".csv") && lower.length > 4) return "csv";
  if (lower.endsWith(".xlsx") && lower.length > 5) return "xlsx";
  return null;
}

export interface NewImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Registers a CSV or Excel import job (M09, L0). Sends only record type, file name and format:
 * file contents are never read or uploaded (parsing runs on the backend, D75).
 */
export function NewImportDialog({ open, onOpenChange }: NewImportDialogProps) {
  const t = useText();
  const toast = useToast();
  const online = useOnline();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createImportJob = useCreateImportJob();

  const [entity, setEntity] = useState<ImportEntity>("learner");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<ImportSourceFormat | null>(null);
  const [fileErrorKey, setFileErrorKey] = useState<MessageKey | null>(null);
  const [rootErrorKey, setRootErrorKey] = useState<MessageKey | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntity("learner");
    setSelectedFileName(null);
    setDetectedFormat(null);
    setFileErrorKey(null);
    setRootErrorKey(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  const entityOptions = ENTITIES.map((value) => ({
    value,
    label: t(IMPORT_ENTITY_KEY[value]),
  }));

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRootErrorKey(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFileName(null);
      setDetectedFormat(null);
      setFileErrorKey(null);
      return;
    }

    // Only the file name is inspected; file contents never leave the device.
    setSelectedFileName(file.name);
    const format = detectFormat(file.name);
    if (format === null) {
      setDetectedFormat(null);
      setFileErrorKey("m09.newDialog.unsupportedFormat");
      return;
    }

    const check = ImportJobInputSchema.safeParse({
      entity,
      fileName: file.name,
      sourceFormat: format,
    });
    if (!check.success) {
      setDetectedFormat(null);
      setFileErrorKey("m09.newDialog.invalidFileName");
      return;
    }

    setDetectedFormat(format);
    setFileErrorKey(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRootErrorKey(null);

    if (selectedFileName === null) {
      setFileErrorKey("common.required");
      return;
    }
    if (detectedFormat === null) {
      setFileErrorKey(fileErrorKey ?? "m09.newDialog.unsupportedFormat");
      return;
    }

    const parsed = ImportJobInputSchema.safeParse({
      entity,
      fileName: selectedFileName,
      sourceFormat: detectedFormat,
    });
    if (!parsed.success) {
      setFileErrorKey("m09.newDialog.invalidFileName");
      return;
    }

    try {
      await createImportJob.mutateAsync(parsed.data);
      toast.show({ tone: "success", title: t("m09.newDialog.created") });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        const paths = new Set((error.error.details ?? []).map((detail) => detail.path));
        if (paths.has("fileName")) setFileErrorKey("m09.newDialog.invalidFileName");
        else if (paths.has("sourceFormat")) setFileErrorKey("m09.newDialog.unsupportedFormat");
        else setRootErrorKey("m09.newDialog.invalidRequest");
      } else if (error instanceof ApiRequestError && error.error.code === "forbidden") {
        setRootErrorKey("m09.newDialog.forbidden");
      } else {
        setRootErrorKey("m09.newDialog.saveFailed");
        toast.show({ tone: "danger", title: t("m09.newDialog.saveFailed") });
      }
    }
  };

  const fileError = fileErrorKey ? t(fileErrorKey) : undefined;
  const rootError = rootErrorKey ? t(rootErrorKey) : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={t("m09.newDialog.title")}
      description={t("m09.newDialog.description")}
      footer={
        <>
          {!online && (
            <p role="status" className="me-auto text-body-sm text-text-secondary">
              {t("common.offline")}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="m09-new-import-form"
            loading={createImportJob.isPending}
            disabled={!online}
          >
            {t("m09.newDialog.submit")}
          </Button>
        </>
      }
    >
      <form
        id="m09-new-import-form"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="space-y-4"
      >
        {rootError && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
          >
            {rootError}
          </p>
        )}

        <Select
          label={t("m09.newDialog.entity")}
          required
          options={entityOptions}
          value={entity}
          onChange={(event) => setEntity(event.target.value as ImportEntity)}
        />

        <Field
          label={t("m09.newDialog.file")}
          htmlFor={fileInputId}
          description={t("m09.newDialog.fileHint")}
          error={fileError}
          required
        >
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".csv,.xlsx"
            required
            aria-invalid={fileError ? true : undefined}
            aria-describedby={getDescribedBy(fileInputId, true, Boolean(fileError))}
            onChange={handleFileChange}
            className={cn(
              "block w-full rounded-md border bg-bg-surface p-2 text-body-sm text-text-secondary transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground",
              "file:me-3 file:rounded-md file:border file:border-border-strong file:bg-bg-raised file:px-3 file:py-1.5 file:font-sans file:text-body-sm file:font-medium file:text-text-primary hover:file:bg-bg-surface",
              fileError ? "border-danger" : "border-border-strong",
            )}
          />
        </Field>

        {detectedFormat !== null && fileErrorKey === null && (
          <p className="text-body-sm text-text-secondary">
            {t("m09.newDialog.detectedFormat", { format: t(IMPORT_FORMAT_KEY[detectedFormat]) })}
          </p>
        )}
      </form>
    </Modal>
  );
}
