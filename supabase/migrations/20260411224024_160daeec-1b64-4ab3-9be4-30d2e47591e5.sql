
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assistente' CHECK (role IN ('estagiario', 'assistente', 'analista', 'coordenacao')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by all authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create demand_status_entries table
CREATE TABLE public.demand_status_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  demand_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  filled_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (client_name, month, year, demand_type)
);

ALTER TABLE public.demand_status_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all entries"
  ON public.demand_status_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert entries"
  ON public.demand_status_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = filled_by);

CREATE POLICY "Authenticated users can update entries"
  ON public.demand_status_entries FOR UPDATE TO authenticated USING (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_demand_status_entries_updated_at
  BEFORE UPDATE ON public.demand_status_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
