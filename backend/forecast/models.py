"""
Forecasting models for Mitanin Signal:
1. Baseline: Negative Binomial GLM with trend and harmonic seasonality.
2. Weather model: Baseline terms plus lagged weather features (rainfall, temperature).
Handles simulation-based 80% prediction intervals.
"""

from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

try:
    import scipy.stats as stats
except (ImportError, OSError):
    stats = None

try:
    import statsmodels.genmod.generalized_linear_model as sm_glm
    import statsmodels.genmod.families as sm_families
except (ImportError, OSError):
    sm_glm = None
    sm_families = None


def construct_features(
    df: pd.DataFrame,
    granularity: str = "weekly",
    weather_lags_steps: Optional[List[int]] = None,
    include_weather: bool = False,
    weather_stats: Optional[Dict[str, float]] = None,
    total_timeline_len: Optional[int] = None,
) -> Tuple[np.ndarray, List[str], Dict[str, float]]:
    """
    Constructs feature matrix X and feature names:
    - Constant intercept
    - Normalized time trend (step / total_timeline_len)
    - Harmonic Fourier seasonality: sin(2*pi*k*step/P), cos(2*pi*k*step/P)
      where P is period (52 for weekly, 12 for monthly).
    - If include_weather:
      lagged standardized rainfall_mm and temp_c for each lag in weather_lags_steps.
    """
    n = len(df)
    period = 52.0 if granularity == "weekly" else 12.0
    N = float(total_timeline_len if total_timeline_len and total_timeline_len > 0 else max(n, 1))

    # Calendar seasonality and continuous trend
    if "date" in df.columns:
        dt = pd.to_datetime(df["date"])
        if granularity == "weekly":
            season_step = dt.dt.isocalendar().week.astype(float).values - 1.0
        else:
            season_step = dt.dt.month.astype(float).values - 1.0
        
        if "step_idx" in df.columns:
            trend_step = df["step_idx"].astype(float).values / N
        else:
            trend_step = np.arange(n, dtype=float) / N
    elif "step_idx" in df.columns:
        season_step = df["step_idx"].astype(float).values % period
        trend_step = df["step_idx"].astype(float).values / N
    else:
        season_step = np.arange(n, dtype=float) % period
        trend_step = np.arange(n, dtype=float) / N

    cols = []
    names = []

    # 1. Intercept
    cols.append(np.ones(n))
    names.append("intercept")

    # 2. Linear trend (normalized)
    cols.append(trend_step)
    names.append("trend")

    # 3. Harmonic Fourier seasonality (first 2 harmonics)
    for k in [1, 2]:
        sin_term = np.sin(2.0 * np.pi * k * season_step / period)
        cos_term = np.cos(2.0 * np.pi * k * season_step / period)
        cols.append(sin_term)
        names.append(f"sin_{k}")
        cols.append(cos_term)
        names.append(f"cos_{k}")

    # 4. Weather lags (if requested)
    computed_stats = {}
    if include_weather and weather_lags_steps:
        # Compute or use existing standardization statistics
        has_rain = "rainfall_mm" in df.columns and df["rainfall_mm"].notna().sum() > 0
        has_temp = "temp_c" in df.columns and df["temp_c"].notna().sum() > 0

        if weather_stats is not None:
            r_mean = weather_stats.get("rain_mean", 0.0)
            r_std = max(weather_stats.get("rain_std", 1.0), 1e-4)
            t_mean = weather_stats.get("temp_mean", 26.0)
            t_std = max(weather_stats.get("temp_std", 1.0), 1e-4)
        else:
            r_vals = df["rainfall_mm"].dropna().values if has_rain else np.array([0.0])
            t_vals = df["temp_c"].dropna().values if has_temp else np.array([26.0])
            r_mean = float(np.mean(r_vals)) if len(r_vals) > 0 else 0.0
            r_std = float(max(np.std(r_vals), 1.0)) if len(r_vals) > 0 else 1.0
            t_mean = float(np.mean(t_vals)) if len(t_vals) > 0 else 26.0
            t_std = float(max(np.std(t_vals), 1.0)) if len(t_vals) > 0 else 1.0

        computed_stats = {
            "rain_mean": r_mean,
            "rain_std": r_std,
            "temp_mean": t_mean,
            "temp_std": t_std,
        }

        for lag in weather_lags_steps:
            col_rain_name = f"rain_lag_{lag}"
            col_temp_name = f"temp_lag_{lag}"

            if col_rain_name in df.columns:
                r_series = df[col_rain_name].fillna(r_mean).values
            elif has_rain:
                # Fallback to shifting within provided df
                shifted = df["rainfall_mm"].shift(lag).fillna(r_mean).values
                r_series = shifted
            else:
                r_series = np.full(n, r_mean)

            if col_temp_name in df.columns:
                t_series = df[col_temp_name].fillna(t_mean).values
            elif has_temp:
                shifted_t = df["temp_c"].shift(lag).fillna(t_mean).values
                t_series = shifted_t
            else:
                t_series = np.full(n, t_mean)

            # Standardize
            cols.append((r_series - r_mean) / r_std)
            names.append(col_rain_name)
            cols.append((t_series - t_mean) / t_std)
            names.append(col_temp_name)

    X = np.column_stack(cols)
    return X, names, computed_stats


class NegativeBinomialForecastModel:
    """
    Negative Binomial GLM wrapper using log link.
    Fits dispersion alpha iteratively or via method of moments.
    """

    def __init__(self, model_type: str = "baseline", granularity: str = "weekly"):
        self.model_type = model_type  # "baseline" or "weather"
        self.granularity = granularity
        self.params_: Optional[np.ndarray] = None
        self.feature_names_: List[str] = []
        self.alpha_: float = 1.0
        self.glm_result_ = None
        self.weather_stats_: Dict[str, float] = {}
        self.total_timeline_len_: Optional[int] = None

    def fit(
        self,
        df_train: pd.DataFrame,
        weather_lags_steps: Optional[List[int]] = None,
        total_timeline_len: Optional[int] = None,
    ) -> "NegativeBinomialForecastModel":
        """Fit model strictly on training historical dataframe."""
        include_weather = (self.model_type == "weather")
        self.total_timeline_len_ = total_timeline_len or len(df_train)

        X, names, stats_dict = construct_features(
            df_train,
            granularity=self.granularity,
            weather_lags_steps=weather_lags_steps,
            include_weather=include_weather,
            total_timeline_len=self.total_timeline_len_,
        )
        self.feature_names_ = names
        self.weather_stats_ = stats_dict

        y = df_train["cases"].fillna(0).astype(float).values

        # Estimate initial dispersion alpha: Var(Y) = mu + alpha * mu^2
        mean_y = np.maximum(np.mean(y), 0.1)
        var_y = np.maximum(np.var(y), 0.1)
        if var_y > mean_y:
            alpha_est = float((var_y - mean_y) / (mean_y ** 2))
            alpha_est = max(0.01, min(alpha_est, 10.0))
        else:
            alpha_est = 0.1
        self.alpha_ = alpha_est

        try:
            if sm_glm is not None and sm_families is not None:
                # Fit statsmodels NegativeBinomial GLM
                family = sm_families.NegativeBinomial(alpha=self.alpha_)
                glm_mod = sm_glm.GLM(y, X, family=family)
                self.glm_result_ = glm_mod.fit(disp=False, maxiter=100)
                self.params_ = self.glm_result_.params
            else:
                raise RuntimeError("statsmodels unavailable, using NumPy IRLS NB-GLM")
        except Exception:
            # Fallback to NumPy IRLS for log-link Negative Binomial GLM
            try:
                beta, _, _, _ = np.linalg.lstsq(X, np.log(np.maximum(y, 0.5)), rcond=None)
                for _ in range(25):
                    eta = np.clip(X @ beta, -5.0, 10.0)
                    mu = np.exp(eta)
                    w = mu / (1.0 + self.alpha_ * mu)
                    z = eta + (y - mu) / np.maximum(mu, 1e-4)
                    xw = X * w[:, None]
                    beta_new = np.linalg.pinv(xw.T @ X + 1e-6 * np.eye(X.shape[1])) @ (xw.T @ z)
                    if np.max(np.abs(beta_new - beta)) < 1e-5:
                        beta = beta_new
                        break
                    beta = beta_new
                self.params_ = beta
            except Exception:
                # Robust fallback to mean log-intercept
                self.params_ = np.zeros(X.shape[1])
                self.params_[0] = np.log(max(mean_y, 0.1))

        return self

    def predict_point(
        self,
        df_target: pd.DataFrame,
        weather_lags_steps: Optional[List[int]] = None,
    ) -> np.ndarray:
        """
        Compute predicted mean response mu = exp(X * beta).
        """
        include_weather = (self.model_type == "weather")
        X, _, _ = construct_features(
            df_target,
            granularity=self.granularity,
            weather_lags_steps=weather_lags_steps,
            include_weather=include_weather,
            weather_stats=self.weather_stats_,
            total_timeline_len=self.total_timeline_len_,
        )

        log_mu = np.dot(X, self.params_)
        # Prevent extreme overflow
        log_mu = np.clip(log_mu, -5.0, 10.0)
        mu = np.exp(log_mu)
        return mu

    def simulate_intervals(
        self,
        point_predictions: np.ndarray,
        n_simulations: int = 1000,
        ci_level: float = 0.80,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generates simulation-based prediction intervals using Negative Binomial distribution.
        Returns (lower_bound, upper_bound) at specified coverage (e.g. 80%).
        """
        alpha = max(self.alpha_, 0.05)
        n_points = len(point_predictions)
        lower_bounds = np.zeros(n_points)
        upper_bounds = np.zeros(n_points)

        half_alpha = (1.0 - ci_level) / 2.0
        q_low = half_alpha
        q_high = 1.0 - half_alpha
        rng = np.random.default_rng(42)

        for i, mu in enumerate(point_predictions):
            mu_val = max(float(mu), 0.01)
            # Parameterize Scipy nbinom:
            # mean = n * (1 - p) / p = mu
            # var = mu + alpha * mu^2 = n * (1 - p) / p^2
            # => p = 1 / (1 + alpha * mu), n = 1 / alpha
            p = 1.0 / (1.0 + alpha * mu_val)
            n_param = 1.0 / alpha

            if stats is not None:
                # Quantiles directly from negative binomial distribution
                low_val = stats.nbinom.ppf(q_low, n_param, p)
                high_val = stats.nbinom.ppf(q_high, n_param, p)
            else:
                samples = rng.negative_binomial(n_param, p, size=max(n_simulations, 1000))
                low_val, high_val = np.quantile(samples, [q_low, q_high])

            lower_bounds[i] = max(0.0, float(np.nan_to_num(low_val, nan=0.0)))
            upper_bounds[i] = max(lower_bounds[i], float(np.nan_to_num(high_val, nan=mu_val * 2)))

        return lower_bounds, upper_bounds
