import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import type { FoodInstruction, MedicationReminder } from '../../types/carescript';
import { getTodayKey } from '../../utils/dateUtils';

interface ReminderFormModalProps {
  open: boolean;
  editingReminder: MedicationReminder | null;
  onClose: () => void;
}

export const ReminderFormModal: React.FC<ReminderFormModalProps> = ({
  open,
  editingReminder,
  onClose,
}) => {
  const { prescriptions, addReminder, updateReminder, showToast, t } = useCareScript();

  const [medicineName, setMedicineName] = useState('');
  const [strength, setStrength] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Once daily');
  const [times, setTimes] = useState<string[]>(['09:00']);
  const [startDate, setStartDate] = useState(getTodayKey());
  const [endDate, setEndDate] = useState('');
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>('after_food');
  const [notes, setNotes] = useState('');
  const [sourceRxId, setSourceRxId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editingReminder) {
      setMedicineName(editingReminder.medicineName);
      setStrength(editingReminder.strength);
      setDosage(editingReminder.dosage);
      setFrequency(editingReminder.frequency);
      setTimes(editingReminder.scheduledTimes.length > 0 ? editingReminder.scheduledTimes : ['09:00']);
      setStartDate(editingReminder.startDate);
      setEndDate(editingReminder.endDate ?? '');
      setFoodInstruction(editingReminder.foodInstruction);
      setNotes(editingReminder.notes ?? '');
      setSourceRxId(editingReminder.sourcePrescriptionId ?? '');
    } else {
      setMedicineName('');
      setStrength('');
      setDosage('');
      setFrequency('Once daily');
      setTimes(['09:00']);
      setStartDate(getTodayKey());
      setEndDate('');
      setFoodInstruction('after_food');
      setNotes('');
      setSourceRxId('');
    }
  }, [open, editingReminder]);

  if (!open) return null;

  const verifiedPrescriptions = prescriptions.filter((p) => p.reviewStatus === 'verified');

  const handlePrefillFromMedicine = (medKey: string) => {
    if (!medKey) return;
    const [rxId, medId] = medKey.split('::');
    const rx = verifiedPrescriptions.find((p) => p.id === rxId);
    const med = rx?.medicines.find((m) => m.id === medId);
    if (!rx || !med) return;

    setMedicineName(med.name);
    setStrength(med.strength);
    setDosage(med.dosage);
    setFrequency(med.frequency || 'Once daily');
    const parsedTimes = med.timing
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{2}:\d{2}$/.test(s));
    setTimes(parsedTimes.length > 0 ? parsedTimes : ['09:00']);
    if (med.foodInstruction !== 'unclear') {
      setFoodInstruction(med.foodInstruction);
    }
    setNotes(med.notes ?? '');
    setSourceRxId(rx.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!medicineName.trim() || !strength.trim() || !dosage.trim()) {
      setError('Please enter Medicine Name, Strength, and Dosage.');
      return;
    }
    const cleanTimes = times.map((tm) => tm.trim()).filter((tm) => /^\d{2}:\d{2}$/.test(tm));
    if (cleanTimes.length === 0) {
      setError('Please add at least one valid scheduled time.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    const payload = {
      medicineName: medicineName.trim(),
      strength: strength.trim(),
      dosage: dosage.trim(),
      frequency,
      scheduledTimes: Array.from(new Set(cleanTimes)).sort(),
      startDate,
      endDate: endDate || undefined,
      foodInstruction,
      notes: notes.trim() || undefined,
      sourcePrescriptionId: sourceRxId && !sourceRxId.startsWith('demo-') ? sourceRxId : undefined,
      verified: true,
      active: true,
    };

    try {
      if (editingReminder) {
        await updateReminder({ ...editingReminder, ...payload });
        showToast(`Updated reminder for ${payload.medicineName}.`, 'success');
      } else {
        await addReminder(payload);
        showToast(`Added reminder for ${payload.medicineName}.`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save reminder.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20, 26, 33, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
    >
      <div className="cs-card w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="absolute top-4 right-4 p-2 rounded-lg"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="reminder-modal-title" className="text-xl font-bold">
          {editingReminder ? 'Edit Medication Reminder' : t.reminders.addReminder}
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Enter instructions exactly as prescribed by your doctor or verified on your prescription.
        </p>

        {/* Optional pre-fill from verified prescriptions */}
        {!editingReminder && verifiedPrescriptions.length > 0 && (
          <div
            className="mt-4 p-3.5 rounded-xl"
            style={{ backgroundColor: 'var(--color-light-blue)' }}
          >
            <label htmlFor="prefill-rx" className="block text-xs font-bold mb-1.5">
              Or select from a Verified Prescription
            </label>
            <select
              id="prefill-rx"
              className="cs-input text-sm"
              defaultValue=""
              onChange={(e) => handlePrefillFromMedicine(e.target.value)}
            >
              <option value="">Choose a verified medicine...</option>
              {verifiedPrescriptions.flatMap((rx) =>
                rx.medicines.map((med) => (
                  <option key={`${rx.id}::${med.id}`} value={`${rx.id}::${med.id}`}>
                    {med.name} ({med.strength}) — {rx.title}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label htmlFor="rem-name" className="block text-xs font-semibold mb-1">
                Medicine Name *
              </label>
              <input
                id="rem-name"
                type="text"
                className="cs-input text-sm"
                placeholder="e.g., Metformin"
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="rem-strength" className="block text-xs font-semibold mb-1">
                Strength *
              </label>
              <input
                id="rem-strength"
                type="text"
                className="cs-input text-sm"
                placeholder="e.g., 500 mg"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="rem-dosage" className="block text-xs font-semibold mb-1">
                Dosage *
              </label>
              <input
                id="rem-dosage"
                type="text"
                className="cs-input text-sm"
                placeholder="e.g., 1 tablet"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="rem-freq" className="block text-xs font-semibold mb-1">
                Frequency
              </label>
              <select
                id="rem-freq"
                className="cs-input text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="Once daily">Once daily</option>
                <option value="Twice daily">Twice daily</option>
                <option value="Three times daily">Three times daily</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div>
              <label htmlFor="rem-food" className="block text-xs font-semibold mb-1">
                Food Instruction
              </label>
              <select
                id="rem-food"
                className="cs-input text-sm"
                value={foodInstruction}
                onChange={(e) => setFoodInstruction(e.target.value as FoodInstruction)}
              >
                <option value="before_food">{t.common.beforeFood}</option>
                <option value="after_food">{t.common.afterFood}</option>
                <option value="with_food">{t.common.withFood}</option>
                <option value="no_instruction">{t.common.noInstruction}</option>
              </select>
            </div>

            <div>
              <label htmlFor="rem-start" className="block text-xs font-semibold mb-1">
                Start Date *
              </label>
              <input
                id="rem-start"
                type="date"
                className="cs-input text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="rem-end" className="block text-xs font-semibold mb-1">
                End Date (Optional)
              </label>
              <input
                id="rem-end"
                type="date"
                className="cs-input text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Scheduled Times */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">Scheduled Time(s) *</label>
              <button
                type="button"
                onClick={() => setTimes((prev) => [...prev, '20:00'])}
                className="text-xs font-semibold inline-flex items-center gap-1"
                style={{ color: 'var(--color-accent)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Time
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {times.map((tm, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="time"
                    className="cs-input text-sm w-auto"
                    value={tm}
                    onChange={(e) => {
                      const next = [...times];
                      next[idx] = e.target.value;
                      setTimes(next);
                    }}
                    required
                  />
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTimes((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove time"
                      className="p-2 rounded-lg"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="rem-notes" className="block text-xs font-semibold mb-1">
              Additional Notes (Optional)
            </label>
            <textarea
              id="rem-notes"
              rows={2}
              className="cs-input text-sm"
              placeholder="e.g., Take with water"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-2 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className="cs-btn-secondary px-4 py-2.5 text-sm">
              {t.common.cancel}
            </button>
            <button type="submit" className="cs-btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
              <Save className="w-4 h-4" />
              {t.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
