import React, { useEffect, useState } from 'react';
import { X, Save, User } from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import { computeAgeFromDob } from '../../services/careScriptApi';
import type { PatientProfile } from '../../types/carescript';

interface PatientProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const PatientProfileModal: React.FC<PatientProfileModalProps> = ({ open, onClose }) => {
  const { profile, updateProfile, t } = useCareScript();
  const [form, setForm] = useState<PatientProfile>(profile);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(profile);
      setError('');
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError('Please provide your name.');
      return;
    }
    const computedAge = form.dateOfBirth ? computeAgeFromDob(form.dateOfBirth) : form.age.trim();
    updateProfile({
      ...form,
      fullName: form.fullName.trim(),
      age: computedAge,
      dateOfBirth: form.dateOfBirth || undefined,
      height: form.height.trim(),
      weight: form.weight.trim(),
      bloodGroup: form.bloodGroup.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20, 26, 33, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
    >
      <div className="cs-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="absolute top-4 right-4 p-2 rounded-lg"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: 'var(--color-light-blue)', color: 'var(--color-primary)' }}
          >
            <User className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="edit-profile-title" className="text-xl font-bold">
              {t.dashboard.editProfile}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Only your name is required. Other health details are optional.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="prof-name" className="block text-sm font-semibold mb-1">
                Full Name *
              </label>
              <input
                id="prof-name"
                type="text"
                className="cs-input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="prof-id" className="block text-sm font-semibold mb-1">
                {t.dashboard.patientId}
              </label>
              <input
                id="prof-id"
                type="text"
                className="cs-input"
                value={form.id}
                disabled={Boolean(form.firebaseUid)}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="prof-dob" className="block text-sm font-semibold mb-1">
                Date of Birth (optional)
              </label>
              <input
                id="prof-dob"
                type="date"
                className="cs-input"
                max={new Date().toISOString().slice(0, 10)}
                value={form.dateOfBirth ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    dateOfBirth: e.target.value,
                    age: computeAgeFromDob(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="prof-height" className="block text-sm font-semibold mb-1">
                {t.dashboard.height} (optional)
              </label>
              <input
                id="prof-height"
                type="text"
                className="cs-input"
                placeholder="e.g., 165 cm"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="prof-weight" className="block text-sm font-semibold mb-1">
                {t.dashboard.weight} (optional)
              </label>
              <input
                id="prof-weight"
                type="text"
                className="cs-input"
                placeholder="e.g., 64 kg"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="prof-blood" className="block text-sm font-semibold mb-1">
                {t.dashboard.bloodGroup} (optional)
              </label>
              <select
                id="prof-blood"
                className="cs-input"
                value={form.bloodGroup}
                onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
              >
                <option value="">Prefer not to specify</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className="cs-btn-secondary px-4 py-2.5 text-sm">
              {t.common.cancel}
            </button>
            <button type="submit" className="cs-btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
              <Save className="w-4 h-4" aria-hidden="true" />
              {t.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
