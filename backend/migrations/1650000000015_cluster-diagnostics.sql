-- Cluster run diagnostics — one row per concept per scoring run
-- Appended each time the clustering pipeline executes (audit history, no upsert).

CREATE TABLE IF NOT EXISTS public.cluster_run_diagnostics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  concept_id varchar(30) NOT NULL,
  selected_k integer NOT NULL,
  selected_cov_type varchar(10) NOT NULL,
  silhouette_score numeric(5,3),
  davies_bouldin_index numeric(5,3),
  all_candidates jsonb NOT NULL DEFAULT '[]',
  cluster_sizes jsonb NOT NULL DEFAULT '[]',
  n_users integer,
  n_dimensions integer,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cluster_diag_concept
  ON public.cluster_run_diagnostics (concept_id, computed_at DESC);
