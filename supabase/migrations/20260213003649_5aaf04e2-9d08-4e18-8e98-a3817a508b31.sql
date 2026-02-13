-- Enable realtime for leads table so UI updates instantly on stage changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;