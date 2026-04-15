import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingState {
  step: number;
  completed: boolean;
  checks: {
    accountCreated: boolean;
    whatsappSynced: boolean;
    personalMarked: boolean;
    leadCreated: boolean;
    aiUsed: boolean;
  };
  loading: boolean;
  completedCount: number;
}

export function useOnboarding(): OnboardingState & {
  setStep: (step: number) => Promise<void>;
  markCompleted: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>({
    step: 0,
    completed: true,
    checks: {
      accountCreated: true,
      whatsappSynced: false,
      personalMarked: false,
      leadCreated: false,
      aiUsed: false,
    },
    loading: true,
    completedCount: 1,
  });

  const refresh = useCallback(async () => {
    if (!user) return;

    const [settingsRes, contactsRes, personalRes, leadsRes, aiRes] = await Promise.all([
      supabase.from("user_settings").select("onboarding_step, onboarding_completed").eq("user_id", user.id).maybeSingle(),
      supabase.from("whatsapp_contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("whatsapp_contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_personal", true),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
      supabase.from("api_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    const checks = {
      accountCreated: true,
      whatsappSynced: (contactsRes.count || 0) > 0,
      personalMarked: (personalRes.count || 0) > 0,
      leadCreated: (leadsRes.count || 0) > 0,
      aiUsed: (aiRes.count || 0) > 0,
    };

    const completedCount = Object.values(checks).filter(Boolean).length;
    const step = settingsRes.data?.onboarding_step ?? 0;
    const completed = settingsRes.data?.onboarding_completed ?? false;

    setState({ step, completed, checks, loading: false, completedCount });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const setStep = useCallback(async (newStep: number) => {
    if (!user) return;
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      onboarding_step: newStep,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setState(prev => ({ ...prev, step: newStep }));
  }, [user]);

  const markCompleted = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setState(prev => ({ ...prev, completed: true }));
  }, [user]);

  return { ...state, setStep, markCompleted, refresh };
}
