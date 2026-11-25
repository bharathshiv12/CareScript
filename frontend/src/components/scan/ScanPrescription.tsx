import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import { DEMO_PRESCRIPTION_SVG_DATA_URL } from '../../data/demoData';
import { getPrescriptionSignedUrl, validatePrescriptionFileContent } from '../../services/careScriptApi';
import { getPrescriptionFile } from '../../services/storageService';
import type {
  ExtractedMedicine,
  FoodInstruction,
  Prescription,
  ProcessingState,
} from '../../types/carescript';
import { getTodayKey } from '../../utils/dateUtils';
import { ConfirmDialog } from '../ui/ConfirmDialog';

function createEmptyMedicine(): ExtractedMedicine {
  return {
    id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    strength: '',
    dosage: '',
    frequency: '',
    timing: '',
    duration: '',
    foodInstruction: 'unclear',
    unclearFields: ['name', 'strength', 'dosage', 'foodInstruction'],
    notes: '',
  };
}

export const ScanPrescription: React.FC = () => {
  const {
    prescriptions,
    uploadAndExtractPrescription,
    retryPrescriptionExtraction,
    confirmPrescription,
    removePrescription,
    addReminder,
    setActiveTab,
    showToast,
    t,
  } = useCareScript();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [retryingExtraction, setRetryingExtraction] = useState(false);

  const [draftRx, setDraftRx] = useState<Prescription | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');

  // Saved prescription detail modal & delete confirm
  const [viewingRx, setViewingRx] = useState<Prescription | null>(null);
  const [viewingPreviewUrl, setViewingPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prescription | null>(null);
  const [justConfirmedRx, setJustConfirmedRx] = useState<Prescription | null>(null);

  useEffect(() => {
    if (!viewingRx) {
      setViewingPreviewUrl(null);
      return;
    }
    let mounted = true;
    const loadPreview = async () => {
      if (viewingRx.storagePath) {
        const signed = await getPrescriptionSignedUrl(viewingRx.storagePath);
        if (mounted && signed) {
          setViewingPreviewUrl(signed);
          return;
        }
      }
      const localUrl = await getPrescriptionFile(viewingRx.id);
      if (mounted) setViewingPreviewUrl(localUrl);
    };
    loadPreview();
    return () => {
      mounted = false;
    };
  }, [viewingRx]);

  const handleFileSelected = async (file: File) => {
    setUploadError('');
    setValidationError('');
    setJustConfirmedRx(null);

    const err = await validatePrescriptionFileContent(file);
    if (err) {
      setUploadError(err);
      setProcessingState('failed');
      return;
    }

    setProcessingState('uploading');
    try {
      const staleDraft = draftRx;
      const localPreviewUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.readAsDataURL(file);
      });

      setProcessingState('processing');
      if (staleDraft && !staleDraft.isDemoSample && staleDraft.reviewStatus === 'pending_review') {
        await removePrescription(staleDraft.id);
      }
      const { prescription, extractionError } = await uploadAndExtractPrescription(file);

      // Ensure at least one editable row exists; never fabricate medicine details
      const normalizedRx: Prescription = {
        ...prescription,
        medicines:
          prescription.medicines.length > 0 ? prescription.medicines : [createEmptyMedicine()],
      };

      if (extractionError) {
        showToast(
          `Saved securely, but AI extraction was unavailable (${extractionError}). Please review and enter details manually.`,
          'warning'
        );
      }

      setPreviewUrl(localPreviewUrl);
      setDraftRx(normalizedRx);
      setProcessingState('review_required');
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : 'Upload failed. Please try again.'
      );
      setProcessingState('failed');
    }
  };

  const handleLoadDemoPrescription = async () => {
    setUploadError('');
    setValidationError('');
    setJustConfirmedRx(null);
    setProcessingState('uploading');
    await new Promise((r) => setTimeout(r, 250));
    setProcessingState('processing');
    await new Promise((r) => setTimeout(r, 450));

    const demoRx: Prescription = {
      id: `rx-demo-${Date.now()}`,
      title: 'Sample Demo Prescription (Contains 1 Unclear Item)',
      doctorName: 'Dr. Kavitha Rao (Demo Sample)',
      uploadDate: new Date().toISOString(),
      fileName: 'sample_demo_prescription.svg',
      fileType: 'image/svg+xml',
      fileSize: 2480,
      hasFilePreview: true,
      processingState: 'review_required',
      reviewStatus: 'pending_review',
      isDemoSample: true,
      medicines: [
        {
          id: 'demo-scan-1',
          name: 'Metformin',
          strength: '500 mg',
          dosage: '1 tablet',
          frequency: 'Twice daily',
          timing: '08:00, 20:00',
          duration: '30 days',
          foodInstruction: 'after_food',
          unclearFields: [],
          notes: 'Demo sample item',
        },
        {
          id: 'demo-scan-2',
          name: 'Amlodipine',
          strength: '5 mg',
          dosage: '1 tablet',
          frequency: 'Once daily',
          timing: '09:00',
          duration: '30 days',
          foodInstruction: 'after_food',
          unclearFields: [],
          notes: 'Demo sample item',
        },
        {
          id: 'demo-scan-3',
          name: 'Vitamin D3 (Smudged strength)',
          strength: '',
          dosage: '1 capsule',
          frequency: '',
          timing: '',
          duration: '4 weeks',
          foodInstruction: 'unclear',
          unclearFields: ['strength', 'frequency', 'foodInstruction'],
          notes: 'Handwriting unclear on sample — confirm with pharmacist before scheduling.',
        },
      ],
    };

    setPreviewUrl(DEMO_PRESCRIPTION_SVG_DATA_URL);
    setDraftRx(demoRx);
    setProcessingState('review_required');
  };

  const clearDraft = async () => {
    const staleDraft = draftRx;
    setDraftRx(null);
    setPreviewUrl(null);
    setProcessingState('idle');
    setUploadError('');
    setValidationError('');
    if (staleDraft && !staleDraft.isDemoSample && staleDraft.reviewStatus === 'pending_review') {
      await removePrescription(staleDraft.id);
    }
  };

  const handleResumeReview = async (rx: Prescription) => {
    setUploadError('');
    setValidationError('');
    setJustConfirmedRx(null);
    let url: string | null = null;
    if (rx.storagePath) {
      url = await getPrescriptionSignedUrl(rx.storagePath);
    }
    if (!url) {
      url = await getPrescriptionFile(rx.id);
    }
    setPreviewUrl(url);
    setDraftRx({
      ...rx,
      medicines: rx.medicines.length > 0 ? rx.medicines : [createEmptyMedicine()],
    });
    setProcessingState('review_required');
  };

  const handleRetryExtraction = async () => {
    if (!draftRx || !draftRx.storagePath || retryingExtraction) return;
    setRetryingExtraction(true);
    setUploadError('');
    try {
      const updated = await retryPrescriptionExtraction(draftRx.id);
      if (updated) {
        setDraftRx({
          ...updated,
          medicines: updated.medicines.length > 0 ? updated.medicines : [createEmptyMedicine()],
        });
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to retry AI extraction right now.',
        'error'
      );
    } finally {
      setRetryingExtraction(false);
    }
  };

  const updateMedField = (
    medId: string,
    field: keyof ExtractedMedicine,
    value: string
  ) => {
    if (!draftRx) return;
    setDraftRx({
      ...draftRx,
      medicines: draftRx.medicines.map((m) => {
        if (m.id !== medId) return m;
        const nextUnclear = value.trim() && value !== 'unclear'
          ? m.unclearFields.filter((f) => f !== field)
          : m.unclearFields;
        return { ...m, [field]: value, unclearFields: nextUnclear };
      }),
    });
  };

  const toggleUnclearFlag = (medId: string, field: string) => {
    if (!draftRx) return;
    setDraftRx({
      ...draftRx,
      medicines: draftRx.medicines.map((m) => {
        if (m.id !== medId) return m;
        const exists = m.unclearFields.includes(field);
        return {
          ...m,
          unclearFields: exists
            ? m.unclearFields.filter((f) => f !== field)
            : [...m.unclearFields, field],
        };
      }),
    });
  };

  const handleConfirmPrescription = async () => {
    if (!draftRx) return;
    setValidationError('');

    if (draftRx.medicines.length === 0) {
      setValidationError('Please add at least one verified medicine before confirming.');
      return;
    }

    for (let i = 0; i < draftRx.medicines.length; i++) {
      const m = draftRx.medicines[i];
      if (m.unclearFields.length > 0 || m.foodInstruction === 'unclear') {
        setValidationError(
          `Medicine #${i + 1} (${m.name || 'Unnamed'}) still has fields marked "Unclear / Needs Verification". Please review, edit, and clear those flags after checking with your prescription or pharmacist.`
        );
        return;
      }
      if (!m.name.trim() || !m.strength.trim() || !m.dosage.trim()) {
        setValidationError(
          `Medicine #${i + 1} requires Name, Strength, and Dosage before confirmation.`
        );
        return;
      }
    }

    const confirmed: Prescription = {
      ...draftRx,
      processingState: 'extraction_completed',
      reviewStatus: 'verified',
    };

    try {
      await confirmPrescription(confirmed, previewUrl ?? undefined);
      setJustConfirmedRx(confirmed);
      setDraftRx(null);
      setPreviewUrl(null);
      setProcessingState('extraction_completed');
      showToast('Prescription verified and saved!', 'success');
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to save prescription confirmation.'
      );
    }
  };

  const handleCreateRemindersFromRx = async (rx: Prescription) => {
    const todayKey = getTodayKey();
    let count = 0;
    try {
      for (const m of rx.medicines) {
        if (m.foodInstruction === 'unclear' || m.unclearFields.length > 0) continue;
        const parsedTimes = m.timing
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^\d{2}:\d{2}$/.test(s));
        const scheduledTimes = parsedTimes.length > 0 ? parsedTimes : ['09:00'];

        await addReminder({
          medicineName: m.name,
          strength: m.strength,
          dosage: m.dosage,
          frequency: m.frequency || 'Once daily',
          scheduledTimes,
          startDate: todayKey,
          foodInstruction: m.foodInstruction as FoodInstruction,
          notes: m.notes,
          sourcePrescriptionId: rx.isDemoSample ? undefined : rx.id,
          verified: true,
          active: true,
        });
        count += 1;
      }
      showToast(`Created ${count} medication reminder(s) from verified prescription.`, 'success');
      setJustConfirmedRx(null);
      setActiveTab('reminders');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create reminders.', 'error');
    }
  };

  const hasAnyUnclear = draftRx?.medicines.some(
    (m) => m.unclearFields.length > 0 || m.foodInstruction === 'unclear'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="cs-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.scan.title}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t.scan.subtitle}
            </p>
          </div>
          {!draftRx && (
            <button
              type="button"
              onClick={handleLoadDemoPrescription}
              className="cs-btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <Sparkles className="w-4 h-4" style={{ color: 'var(--color-purple)' }} aria-hidden="true" />
              {t.scan.tryDemo}
            </button>
          )}
        </div>
      </section>

      {/* Post-confirm shortcut */}
      {justConfirmedRx && !draftRx && (
        <section
          className="cs-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2"
          style={{ borderColor: 'var(--color-success)', backgroundColor: 'var(--color-success-bg)' }}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
            <div>
              <div className="font-bold" style={{ color: 'var(--color-success)' }}>
                {justConfirmedRx.title} is verified and saved!
              </div>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text)' }}>
                Would you like to add its {justConfirmedRx.medicines.length} verified medicine(s) to your daily reminders?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCreateRemindersFromRx(justConfirmedRx)}
              className="cs-btn-primary px-4 py-2.5 text-sm"
            >
              {t.scan.createReminders}
            </button>
            <button
              type="button"
              onClick={() => setJustConfirmedRx(null)}
              className="cs-btn-secondary px-3 py-2.5 text-sm"
            >
              {t.common.close}
            </button>
          </div>
        </section>
      )}

      {/* A & B. Upload Interface (when no draft active) */}
      {!draftRx && (
        <section className="cs-card p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelected(file);
            }}
            className="rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
            style={{
              backgroundColor: 'var(--color-light-purple)',
              borderColor: dragActive ? 'var(--color-purple)' : 'var(--color-border)',
            }}
          >
            {processingState === 'uploading' || processingState === 'processing' ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--color-purple)' }} />
                <div className="font-bold text-base">
                  {processingState === 'uploading'
                    ? 'Uploading prescription...'
                    : 'Preparing prescription review...'}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Your file is processed safely in your browser.
                </p>
              </div>
            ) : (
              <>
                <div
                  className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-purple)' }}
                >
                  <UploadCloud className="w-8 h-8" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-bold">Drag &amp; drop your prescription here</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t.scan.supportedFormats}
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="cs-btn-purple px-5 py-3 text-sm inline-flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" aria-hidden="true" />
                    {t.scan.chooseFile}
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="cs-btn-primary px-5 py-3 text-sm inline-flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    {t.scan.takePhoto}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>

          {uploadError && (
            <div
              role="alert"
              className="mt-4 p-4 rounded-xl flex items-start gap-3 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </section>
      )}

      {/* C, D, E. Prescription Review Interface */}
      {draftRx && (
        <section className="space-y-4">
          {/* Status / Safety Banner */}
          <div
            className="cs-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4"
            style={{
              borderLeftColor: hasAnyUnclear ? 'var(--color-warning)' : 'var(--color-accent)',
            }}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert
                className="w-5 h-5 shrink-0 mt-0.5"
                style={{ color: hasAnyUnclear ? 'var(--color-warning)' : 'var(--color-accent)' }}
              />
              <div className="text-sm">
                <div className="font-bold flex flex-wrap items-center gap-2">
                  <span>Status: Review Required</span>
                  {draftRx.isDemoSample && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
                    >
                      {t.common.demoBadge}
                    </span>
                  )}
                </div>
                <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {draftRx.isDemoSample
                    ? 'This is sample demo data. Notice Item #3 is flagged Unclear / Needs Verification to demonstrate CareScript’s safety checks.'
                    : draftRx.storagePath
                    ? 'Review extracted details against your original prescription below before confirming. Never guess unclear handwriting.'
                    : 'Automated OCR is not connected in this local browser mode. To avoid guessing medicine names or dosages, please enter and verify the details from your prescription preview below.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {draftRx.storagePath && !draftRx.isDemoSample && (
                <button
                  type="button"
                  disabled={retryingExtraction}
                  onClick={() => void handleRetryExtraction()}
                  className="cs-btn-secondary px-3 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {retryingExtraction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-purple)' }} />
                  )}
                  {retryingExtraction ? 'Extracting...' : 'Retry AI Extraction'}
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cs-btn-secondary px-3 py-2 text-xs inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replace
              </button>
              <button
                type="button"
                onClick={clearDraft}
                className="px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Original Prescription Preview */}
            <div className="lg:col-span-5 cs-card p-5">
              <h2 className="text-base font-bold mb-3">Original Prescription</h2>
              <p className="text-xs mb-3 truncate" style={{ color: 'var(--color-text-muted)' }}>
                {draftRx.fileName} ({Math.max(1, Math.round(draftRx.fileSize / 1024))} KB)
              </p>

              {previewUrl && draftRx.fileType === 'application/pdf' ? (
                <div className="space-y-2">
                  <iframe
                    src={previewUrl}
                    title="Uploaded prescription PDF preview"
                    className="w-full h-96 rounded-xl border"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold inline-block"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Open PDF in new tab
                  </a>
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Uploaded prescription preview"
                  className="w-full max-h-[460px] object-contain rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF' }}
                />
              ) : null}
            </div>

            {/* Editable Extracted Information */}
            <div className="lg:col-span-7 cs-card p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">Prescription Details &amp; Verification</h2>
                <button
                  type="button"
                  onClick={() =>
                    setDraftRx({
                      ...draftRx,
                      medicines: [...draftRx.medicines, createEmptyMedicine()],
                    })
                  }
                  className="cs-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Medicine Row
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Prescription Title</label>
                  <input
                    type="text"
                    className="cs-input text-sm"
                    value={draftRx.title}
                    onChange={(e) => setDraftRx({ ...draftRx, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Doctor / Clinic (Optional)</label>
                  <input
                    type="text"
                    className="cs-input text-sm"
                    placeholder="e.g., Dr. Rao"
                    value={draftRx.doctorName ?? ''}
                    onChange={(e) => setDraftRx({ ...draftRx, doctorName: e.target.value })}
                  />
                </div>
              </div>

              {hasAnyUnclear && (
                <div
                  className="p-3.5 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{t.scan.unclearWarning}</span>
                </div>
              )}

              <div className="space-y-4">
                {draftRx.medicines.map((med, index) => {
                  const isUnclear = med.unclearFields.length > 0 || med.foodInstruction === 'unclear';
                  return (
                    <div
                      key={med.id}
                      className="p-4 rounded-xl border space-y-3"
                      style={{
                        borderColor: isUnclear ? 'var(--color-warning)' : 'var(--color-border)',
                        backgroundColor: isUnclear ? 'var(--color-warning-bg)' : 'var(--color-light-blue)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm">Medicine #{index + 1}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                            style={{
                              backgroundColor: isUnclear ? 'var(--color-surface)' : 'var(--color-success-bg)',
                              color: isUnclear ? 'var(--color-warning)' : 'var(--color-success)',
                            }}
                          >
                            {isUnclear ? t.common.needsVerification : t.common.verified}
                          </span>
                          {draftRx.medicines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftRx({
                                  ...draftRx,
                                  medicines: draftRx.medicines.filter((item) => item.id !== med.id),
                                })
                              }
                              aria-label={`Remove medicine ${index + 1}`}
                              className="p-1 rounded-lg"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold">Medicine Name *</label>
                            <button
                              type="button"
                              onClick={() => toggleUnclearFlag(med.id, 'name')}
                              className="text-[11px] underline"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              {med.unclearFields.includes('name') ? 'Mark clear' : 'Flag unclear'}
                            </button>
                          </div>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="Unclear / Needs Verification"
                            value={med.name}
                            onChange={(e) => updateMedField(med.id, 'name', e.target.value)}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold">Strength *</label>
                            <button
                              type="button"
                              onClick={() => toggleUnclearFlag(med.id, 'strength')}
                              className="text-[11px] underline"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              {med.unclearFields.includes('strength') ? 'Mark clear' : 'Flag unclear'}
                            </button>
                          </div>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="e.g., 500 mg (Unclear if unreadable)"
                            value={med.strength}
                            onChange={(e) => updateMedField(med.id, 'strength', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold mb-1">Dosage *</label>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="e.g., 1 tablet"
                            value={med.dosage}
                            onChange={(e) => updateMedField(med.id, 'dosage', e.target.value)}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold">Frequency</label>
                            <button
                              type="button"
                              onClick={() => toggleUnclearFlag(med.id, 'frequency')}
                              className="text-[11px] underline"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              {med.unclearFields.includes('frequency') ? 'Mark clear' : 'Flag unclear'}
                            </button>
                          </div>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="e.g., Twice daily"
                            value={med.frequency}
                            onChange={(e) => updateMedField(med.id, 'frequency', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold mb-1">Timing (24h, comma-separated)</label>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="e.g., 08:00, 20:00"
                            value={med.timing}
                            onChange={(e) => updateMedField(med.id, 'timing', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold mb-1">Duration</label>
                          <input
                            type="text"
                            className="cs-input text-sm"
                            placeholder="e.g., 14 days"
                            value={med.duration}
                            onChange={(e) => updateMedField(med.id, 'duration', e.target.value)}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold mb-1">Food Instruction *</label>
                          <select
                            className="cs-input text-sm"
                            value={med.foodInstruction}
                            onChange={(e) => updateMedField(med.id, 'foodInstruction', e.target.value)}
                          >
                            <option value="unclear">{t.common.needsVerification}</option>
                            <option value="before_food">{t.common.beforeFood}</option>
                            <option value="after_food">{t.common.afterFood}</option>
                            <option value="with_food">{t.common.withFood}</option>
                            <option value="no_instruction">{t.common.noInstruction}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {validationError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                >
                  {validationError}
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Confirm any uncertain handwriting with your doctor or pharmacist.
                </p>
                <button
                  type="button"
                  onClick={handleConfirmPrescription}
                  className="cs-btn-primary px-6 py-3 text-sm sm:text-base inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {t.scan.reviewConfirm}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* F. Saved Prescriptions */}
      <section className="cs-card p-5 sm:p-6" aria-labelledby="saved-rx-heading">
        <h2 id="saved-rx-heading" className="text-lg font-bold mb-4">
          {t.scan.savedTitle} ({prescriptions.length})
        </h2>

        {prescriptions.length === 0 ? (
          <div className="p-6 text-center rounded-xl" style={{ backgroundColor: 'var(--color-light-blue)' }}>
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No saved prescriptions yet. Upload one above or try the sample demo prescription.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prescriptions.map((rx) => (
              <div
                key={rx.id}
                className="p-4 rounded-xl border flex flex-col justify-between gap-3"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base">{rx.title}</h3>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0"
                      style={{
                        backgroundColor:
                          rx.reviewStatus === 'verified' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                        color: rx.reviewStatus === 'verified' ? 'var(--color-success)' : 'var(--color-warning)',
                      }}
                    >
                      {rx.reviewStatus === 'verified' ? t.common.verified : t.common.needsVerification}
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs flex flex-wrap gap-2" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Uploaded {new Date(rx.uploadDate).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>{rx.medicines.length} medicine(s)</span>
                    {rx.isDemoSample && (
                      <>
                        <span>·</span>
                        <span className="font-semibold" style={{ color: 'var(--color-warning)' }}>
                          {t.common.demoBadge}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setViewingRx(rx)}
                    className="cs-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Details
                  </button>
                  {rx.reviewStatus === 'pending_review' && (
                    <button
                      type="button"
                      onClick={() => handleResumeReview(rx)}
                      className="cs-btn-purple px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                    >
                      Resume Review
                    </button>
                  )}
                  {rx.reviewStatus === 'verified' && (
                    <button
                      type="button"
                      onClick={() => handleCreateRemindersFromRx(rx)}
                      className="cs-btn-accent px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to Reminders
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rx)}
                    className="ml-auto p-1.5 rounded-lg"
                    style={{ color: 'var(--color-danger)' }}
                    aria-label={`Delete ${rx.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* View Saved Prescription Modal */}
      {viewingRx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(20, 26, 33, 0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-rx-title"
        >
          <div className="cs-card w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="view-rx-title" className="text-xl font-bold">
                  {viewingRx.title}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {viewingRx.doctorName ? `${viewingRx.doctorName} · ` : ''}
                  Uploaded {new Date(viewingRx.uploadDate).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRx(null)}
                className="cs-btn-secondary px-3 py-1.5 text-xs"
              >
                {t.common.close}
              </button>
            </div>

            {viewingPreviewUrl && (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
                {viewingRx.fileType === 'application/pdf' ? (
                  <iframe src={viewingPreviewUrl} title="Saved PDF" className="w-full h-72" />
                ) : (
                  <img
                    src={viewingPreviewUrl}
                    alt={viewingRx.title}
                    className="w-full max-h-72 object-contain bg-white"
                  />
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <h3 className="text-sm font-bold">Verified Medicines</h3>
              {viewingRx.medicines.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl text-sm flex flex-wrap items-center justify-between gap-2"
                  style={{ backgroundColor: 'var(--color-light-blue)' }}
                >
                  <div>
                    <span className="font-bold">{m.name}</span> ({m.strength}) — {m.dosage}
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {m.frequency} · {m.timing || 'No fixed time'} · {m.duration || 'Duration not specified'}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/20">
                    {m.foodInstruction.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete saved prescription?"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? Existing medication reminders you already created will not be deleted automatically.`}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        onConfirm={async () => {
          if (deleteTarget) {
            await removePrescription(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
