'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Scenario } from '@/lib/horizon/scenarios/types';
import {
  createScenarioAction,
  deleteScenarioAction,
  duplicateScenarioAction,
  renameScenarioAction,
} from '@/app/actions/horizon-scenarios';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';

export function ScenarioList({
  scenarios,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
}: {
  scenarios: Scenario[];
  selectedId: string | null; // null = baseline
  onSelect: (id: string | null) => void;
  compareIds: (string | null)[];
  onToggleCompare: (id: string | null) => void;
}) {
  const t = useTranslations('Horizon.scenarios');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    const name = window.prompt(t('namePlaceholder'));
    if (!name) return;
    startTransition(async () => {
      const result = await createScenarioAction({ name });
      if (result.ok) {
        toast.success(t('scenarioAdded'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRename(scenario: Scenario) {
    const name = window.prompt(t('rename'), scenario.name);
    if (!name || name === scenario.name) return;
    startTransition(async () => {
      const result = await renameScenarioAction(scenario.id, { name });
      if (result.ok) {
        toast.success(t('scenarioRenamed'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDuplicate(scenario: Scenario) {
    startTransition(async () => {
      const result = await duplicateScenarioAction(
        scenario.id,
        t('duplicateOf', { name: scenario.name })
      );
      if (result.ok) {
        toast.success(t('scenarioDuplicated'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(scenario: Scenario) {
    if (!window.confirm(t('deleteConfirm'))) return;
    startTransition(async () => {
      const result = await deleteScenarioAction(scenario.id);
      if (result.ok) {
        toast.success(t('scenarioDeleted'));
        if (selectedId === scenario.id) onSelect(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('title')}</h2>
        <Button variant="secondary" onClick={handleCreate} disabled={pending}>
          {t('addScenario')}
        </Button>
      </div>

      <ul className="divide-y divide-sand-200 rounded border border-sand-200 bg-white">
        <li className="flex items-center gap-3 px-3 py-2">
          <input
            type="checkbox"
            checked={compareIds.includes(null)}
            onChange={() => onToggleCompare(null)}
            aria-label={t('baseline')}
          />
          <button
            className={`flex-1 text-left text-sm ${selectedId === null ? 'font-semibold' : ''}`}
            onClick={() => onSelect(null)}
          >
            {t('baseline')}
          </button>
          <span className="text-xs text-ink-muted">{t('baselineNote')}</span>
        </li>

        {scenarios.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted">
            {t('noScenariosYet')}
          </li>
        )}

        {scenarios.map((scenario) => (
          <li key={scenario.id} className="flex items-center gap-3 px-3 py-2">
            <input
              type="checkbox"
              checked={compareIds.includes(scenario.id)}
              onChange={() => onToggleCompare(scenario.id)}
              aria-label={scenario.name}
            />
            <button
              className={`flex-1 text-left text-sm truncate ${
                selectedId === scenario.id ? 'font-semibold' : ''
              }`}
              onClick={() => onSelect(scenario.id)}
            >
              {scenario.name}
            </button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => handleRename(scenario)}
            >
              {t('rename')}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => handleDuplicate(scenario)}
            >
              {t('duplicate')}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => handleDelete(scenario)}
            >
              {t('delete')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
