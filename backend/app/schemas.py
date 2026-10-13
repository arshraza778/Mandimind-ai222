"""
Pydantic request and response schemas for Mitanin Signal API
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Employee username")
    password: str = Field(..., min_length=1, description="Employee password")


class CreateTaskRequest(BaseModel):
    alert_id: Optional[int] = Field(None, description="Linked Alert ID")
    disease_type: Optional[Literal["malaria", "dengue", "diarrhoea", "heat"]] = Field(
        "malaria", description="Disease or health-risk category"
    )
    title: str = Field(..., min_length=2, description="Task title")
    description: Optional[str] = Field(None, description="Detailed task description")
    instructions: Optional[str] = Field(None, description="Specific field instructions")
    steps: Union[List[str], str] = Field(default_factory=list, description="Action steps or instructions")
    owner: str = Field(..., min_length=1, description="Assigned frontline worker")
    owner_id: Optional[int] = Field(None, description="Assigned employee user ID")
    priority: Optional[Literal["Low", "Medium", "High", "Critical"]] = Field("High", description="Task priority")
    district_id: Optional[str] = Field(None, description="Assigned district ID")
    block_id: Optional[str] = Field(None, description="Assigned block ID")
    village_id: Optional[str] = Field(None, description="Assigned village ID")
    location_name: Optional[str] = Field(None, description="Human-readable location label")
    deadline: Optional[datetime] = Field(None, description="Completion deadline")


class MitaninReplyRequest(BaseModel):
    status: Literal["done", "needs_help", "acknowledged", "in_progress", "completed", "cancelled"] = Field(
        ..., description="Frontline reply status"
    )
    actor: Optional[str] = Field("Mitanin Anita [SAMPLE]", description="Name of replying Mitanin worker")
    notes: Optional[str] = Field(None, description="Additional notes or help request details")
    completion_notes: Optional[str] = Field(None, description="Completion summary notes")
    evidence_attachment: Optional[str] = Field(None, description="Attached evidence reference or filename")


class UpdateTaskStatusRequest(BaseModel):
    status: Literal[
        "sent",
        "pending",
        "acknowledged",
        "accepted",
        "in_progress",
        "done",
        "completed",
        "needs_help",
        "blocked",
        "escalated",
        "cancelled",
    ]
    actor: Optional[str] = Field("Supervisor [SAMPLE]", description="Actor executing status transition")
    notes: Optional[str] = Field(None, description="Status change audit remarks")
    owner: Optional[str] = Field(None, description="Optional reassigned task owner")
    priority: Optional[Literal["Low", "Medium", "High", "Critical"]] = Field(None, description="Optional updated priority")
    deadline: Optional[datetime] = Field(None, description="Optional updated deadline")
    completion_notes: Optional[str] = Field(None, description="Optional completion notes")
    evidence_attachment: Optional[str] = Field(None, description="Optional evidence attachment")


class EmployeeTaskActionRequest(BaseModel):
    action: Literal["acknowledge", "start", "update", "complete", "need_help", "cancel"] = Field(
        ..., description="Employee workflow action on task"
    )
    notes: Optional[str] = Field(None, description="Progress or status notes")
    completion_notes: Optional[str] = Field(None, description="Completion notes")
    evidence_attachment: Optional[str] = Field(None, description="Evidence attachment or reference")


class SupervisorTaskPatchRequest(BaseModel):
    priority: Optional[Literal["Low", "Medium", "High", "Critical"]] = Field(None, description="Updated task priority")
    deadline: Optional[datetime] = Field(None, description="Updated deadline")
    status: Optional[str] = Field(None, description="Updated task status")
    instructions: Optional[str] = Field(None, description="Updated instructions")
    notes: Optional[str] = Field(None, description="Supervisor audit note")


class CreateFieldReportRequest(BaseModel):
    task_id: Optional[int] = Field(None, description="Optional linked task ID")
    disease_type: Optional[Literal["malaria", "dengue", "diarrhoea", "heat"]] = Field(
        "malaria", description="Disease or health-risk category"
    )
    title: str = Field(..., min_length=3, description="Report title")
    village_id: Optional[str] = Field(None, description="Village ID within employee jurisdiction")
    households_visited: int = Field(0, ge=0, description="Number of households visited")
    rdt_conducted: int = Field(0, ge=0, description="Rapid diagnostic tests or screenings conducted")
    positive_cases: int = Field(0, ge=0, description="Confirmed/positive cases detected")
    suspected_cases: int = Field(0, ge=0, description="Suspected cases or symptomatic individuals observed")
    emerging_concern: bool = Field(False, description="Flag if report represents an emerging cluster or urgent local concern")
    stagnant_water_sites: int = Field(0, ge=0, description="Stagnant water / breeding / sanitation sites checked")
    nets_distributed: int = Field(0, ge=0, description="LLIN nets / ORS packets / preventive items distributed")
    observations: str = Field(..., min_length=3, description="Field observations and clinical/environmental notes")
    evidence_notes: Optional[str] = Field(None, description="Register/slide IDs or attachment references")


class ReviewFieldReportRequest(BaseModel):
    review_status: Literal["approved", "rejected", "corrections_requested"] = Field(
        ..., description="Supervisor review decision"
    )
    review_notes: str = Field(..., min_length=2, description="Supervisor review comments or requested corrections")


class AdvanceClockRequest(BaseModel):
    hours: float = Field(..., gt=0, description="Hours to advance simulated clock")


class AlertFeedbackRequest(BaseModel):
    action: Literal["active", "acknowledged", "resolved", "expired", "snooze", "false_alarm"] = Field(
        ..., description="Alert lifecycle transition: 'active', 'acknowledged', 'resolved', 'expired', 'snooze', or 'false_alarm'"
    )
    actor: Optional[str] = Field("Supervisor [SAMPLE]", description="Actor updating the alert")
    notes: Optional[str] = Field(None, description="Optional remarks or feedback rationale")


class UpdateLanguagePreferenceRequest(BaseModel):
    language: Literal["en", "hi", "hne"] = Field(..., description="Preferred UI/Voice/Chatbot locale ('en', 'hi', or 'hne')")


class UpdateTaskTemplateRequest(BaseModel):
    disease_type: Optional[Literal["malaria", "dengue", "diarrhoea", "heat"]] = None
    title_en: Optional[str] = Field(None, min_length=2)
    title_hi: Optional[str] = Field(None, min_length=2)
    title_hne: Optional[str] = Field(None, min_length=2)
    instructions_en: Optional[str] = Field(None, min_length=2)
    instructions_hi: Optional[str] = Field(None, min_length=2)
    instructions_hne: Optional[str] = Field(None, min_length=2)
    safety_en: Optional[str] = None
    safety_hi: Optional[str] = None
    safety_hne: Optional[str] = None
    review_status: Optional[Literal["reviewed", "community_draft", "updated_by_admin"]] = "updated_by_admin"


class TTSSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500, description="Text to synthesize into speech")
    language: Literal["en", "hi", "hne"] = Field("en", description="Requested speech language code")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech playback speed")


class ChatbotHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatbotConfirmedAction(BaseModel):
    action_type: Literal["update_task_status", "submit_field_report"]
    confirmed: bool = False
    task_id: Optional[int] = None
    new_status: Optional[Literal["acknowledged", "in_progress", "done", "needs_help"]] = None
    notes: Optional[str] = None
    report_payload: Optional[Dict[str, Any]] = None


class ChatbotMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User question or instruction for Mitanin Sahayak")
    language: Literal["en", "hi", "hne"] = Field("en", description="Requested response language ('en', 'hi', or 'hne')")
    district_id: Optional[str] = Field("DIST_SAMPLE", description="Selected district ID")
    block_id: Optional[str] = Field("BLK_A", description="Selected block ID")
    village_id: Optional[str] = Field(None, description="Selected village ID")
    disease_type: Optional[Literal["malaria", "dengue", "diarrhoea", "heat"]] = Field(None, description="Focused disease tab")
    history: List[ChatbotHistoryMessage] = Field(default_factory=list, description="Recent conversation turns")
    confirmed_action: Optional[ChatbotConfirmedAction] = Field(
        None, description="Explicit confirmation payload for consequential backend operations"
    )


class WeatherDiseasePredictRequest(BaseModel):
    age: float = Field(..., ge=1, le=120, description="Age in years (1 to 120)")
    gender: Union[int, str] = Field(..., description="Gender encoded as 0 (Female) or 1 (Male)")
    temperature_c: float = Field(..., ge=-30.0, le=60.0, description="Ambient temperature in Celsius (-30 to 60)")
    humidity: float = Field(..., ge=0.0, le=100.0, description="Relative humidity as fraction (0.0-1.0) or percentage (0-100)")
    wind_speed_kmh: float = Field(..., ge=0.0, le=200.0, description="Wind speed in km/h (0 to 200)")
    symptoms: Dict[str, Union[int, bool]] = Field(
        default_factory=dict, description="Binary symptom flags keyed by dataset column name"
    )
    medical_history: Dict[str, Union[int, bool]] = Field(
        default_factory=dict, description="Binary medical history flags keyed by dataset column name"
    )

    @model_validator(mode="before")
    @classmethod
    def accept_csv_column_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        alias_map = {
            "Age": "age",
            "Gender": "gender",
            "Temperature (C)": "temperature_c",
            "Humidity": "humidity",
            "Wind Speed (km/h)": "wind_speed_kmh",
        }
        for csv_key, field_key in alias_map.items():
            if field_key not in out and csv_key in out:
                out[field_key] = out[csv_key]

        # Also support flat symptom/history keys passed at top level
        known_top = set(alias_map.keys()) | set(alias_map.values()) | {"symptoms", "medical_history"}
        extra_flags = {
            k: v for k, v in out.items() if k not in known_top and isinstance(v, (int, bool))
        }
        if extra_flags:
            merged_symptoms = dict(out.get("symptoms") or {})
            for k, v in extra_flags.items():
                merged_symptoms.setdefault(k, v)
            out["symptoms"] = merged_symptoms
        return out

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: Union[int, str]) -> int:
        if isinstance(v, bool):
            raise ValueError("Gender must be 0, 1, 'female', or 'male'.")
        if isinstance(v, int):
            if v not in (0, 1):
                raise ValueError("Gender integer code must be 0 or 1.")
            return v
        if isinstance(v, str):
            norm = v.strip().lower()
            if norm in ("0", "female", "f"):
                return 0
            if norm in ("1", "male", "m"):
                return 1
        raise ValueError("Gender must be 0 (Female) or 1 (Male).")


class CsvUploadValidationRequest(BaseModel):
    csv_content: str = Field(..., description="Raw CSV text content to validate against the surveillance + weather contract")
    filename: Optional[str] = Field("uploaded_surveillance.csv", description="Uploaded file name")


class MalariaCaseForecastRequest(BaseModel):
    """
    Request schema for `POST /predict/malaria-cases` (WHO Historical Malaria Incidence & Case Trend Forecaster).
    Supports forecasting by country name (e.g., 'India') from the uploaded dataset (`docs/archive/*.csv`)
    or custom 3-year historical incidence lags (`incidence_lag_1`, `incidence_lag_2`, `incidence_lag_3`).
    """

    country: Optional[str] = Field("India", description="Country name from WHO malaria archive (default: 'India')")
    who_region: Optional[str] = Field(None, description="Optional WHO Region override when supplying custom lags")
    base_year: Optional[int] = Field(
        None,
        ge=2002,
        le=2030,
        description="Optional forecast origin year (defaults to latest observed year 2018)",
    )
    horizon_years: int = Field(
        3,
        ge=1,
        le=5,
        description="Number of annual steps ahead to forecast (1 to 5 years)",
    )
    incidence_lag_1: Optional[float] = Field(
        None,
        ge=0.0,
        le=1000.0,
        description="Optional custom malaria incidence per 1,000 pop at risk at t-1 (base_year)",
    )
    incidence_lag_2: Optional[float] = Field(
        None,
        ge=0.0,
        le=1000.0,
        description="Optional custom malaria incidence per 1,000 pop at risk at t-2 (base_year - 1)",
    )
    incidence_lag_3: Optional[float] = Field(
        None,
        ge=0.0,
        le=1000.0,
        description="Optional custom malaria incidence per 1,000 pop at risk at t-3 (base_year - 2)",
    )
    location_context: Optional[str] = Field(
        None,
        description="Optional Mitanin Signal sub-district location breadcrumb for granularity disclosure",
    )

    @model_validator(mode="after")
    def validate_lag_triplet(self) -> "MalariaCaseForecastRequest":
        lags = [self.incidence_lag_1, self.incidence_lag_2, self.incidence_lag_3]
        provided = [x for x in lags if x is not None]
        if 0 < len(provided) < 3:
            raise ValueError(
                "When providing custom historical incidence lags, all three lags "
                "(incidence_lag_1, incidence_lag_2, incidence_lag_3) must be supplied."
            )
        return self



