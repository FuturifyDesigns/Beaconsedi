export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          accuracy: number | null
          address: string | null
          altitude: number | null
          assigned_unit_id: string | null
          created_at: string
          eta_minutes: number | null
          heading: number | null
          id: string
          incident_code: string | null
          incident_type: string
          is_test: boolean
          latitude: number
          location_sharing: boolean
          location_source: string | null
          location_updated_at: string | null
          longitude: number
          message: string | null
          patient_count: number
          patient_id: string | null
          patient_name: string | null
          patient_phone: string | null
          priority: string
          priority_reason: string | null
          resolved_at: string | null
          responder_id: string | null
          responder_notes: string | null
          speed: number | null
          status: string
          triage: Json | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          altitude?: number | null
          assigned_unit_id?: string | null
          created_at?: string
          eta_minutes?: number | null
          heading?: number | null
          id?: string
          incident_code?: string | null
          incident_type?: string
          is_test?: boolean
          latitude: number
          location_sharing?: boolean
          location_source?: string | null
          location_updated_at?: string | null
          longitude: number
          message?: string | null
          patient_count?: number
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          priority?: string
          priority_reason?: string | null
          resolved_at?: string | null
          responder_id?: string | null
          responder_notes?: string | null
          speed?: number | null
          status?: string
          triage?: Json | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          altitude?: number | null
          assigned_unit_id?: string | null
          created_at?: string
          eta_minutes?: number | null
          heading?: number | null
          id?: string
          incident_code?: string | null
          incident_type?: string
          is_test?: boolean
          latitude?: number
          location_sharing?: boolean
          location_source?: string | null
          location_updated_at?: string | null
          longitude?: number
          message?: string | null
          patient_count?: number
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          priority?: string
          priority_reason?: string | null
          resolved_at?: string | null
          responder_id?: string | null
          responder_notes?: string | null
          speed?: number | null
          status?: string
          triage?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      care_links: {
        Row: {
          carer_id: string
          created_at: string
          created_by: string
          id: string
          patient_id: string
          relationship: string | null
          status: string
          updated_at: string
        }
        Insert: {
          carer_id: string
          created_at?: string
          created_by: string
          id?: string
          patient_id: string
          relationship?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          carer_id?: string
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          relationship?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          ambulance_bays_available: number
          ambulance_bays_total: number
          created_at: string
          diversion_status: string
          icu_available: number
          icu_total: number
          id: string
          latitude: number
          longitude: number
          name: string
          phone: string | null
          theatres_available: number
          theatres_total: number
          trauma_beds_available: number
          trauma_beds_total: number
          updated_at: string
        }
        Insert: {
          ambulance_bays_available?: number
          ambulance_bays_total?: number
          created_at?: string
          diversion_status?: string
          icu_available?: number
          icu_total?: number
          id?: string
          latitude: number
          longitude: number
          name: string
          phone?: string | null
          theatres_available?: number
          theatres_total?: number
          trauma_beds_available?: number
          trauma_beds_total?: number
          updated_at?: string
        }
        Update: {
          ambulance_bays_available?: number
          ambulance_bays_total?: number
          created_at?: string
          diversion_status?: string
          icu_available?: number
          icu_total?: number
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          phone?: string | null
          theatres_available?: number
          theatres_total?: number
          trauma_beds_available?: number
          trauma_beds_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      incident_events: {
        Row: {
          actor_id: string | null
          alert_id: string
          created_at: string
          event_type: string
          id: string
          note: string | null
        }
        Insert: {
          actor_id?: string | null
          alert_id: string
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
        }
        Update: {
          actor_id?: string | null
          alert_id?: string
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_messages: {
        Row: {
          alert_id: string
          body: string
          created_at: string
          delivered_at: string
          duration_seconds: number | null
          id: string
          kind: string
          listened_at: string | null
          media_path: string | null
          read_at: string | null
          recipient_role: string
          sender_id: string | null
          sender_label: string | null
          sender_role: string
          urgent: boolean
        }
        Insert: {
          alert_id: string
          body: string
          created_at?: string
          delivered_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: string
          listened_at?: string | null
          media_path?: string | null
          read_at?: string | null
          recipient_role?: string
          sender_id?: string | null
          sender_label?: string | null
          sender_role?: string
          urgent?: boolean
        }
        Update: {
          alert_id?: string
          body?: string
          created_at?: string
          delivered_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: string
          listened_at?: string | null
          media_path?: string | null
          read_at?: string | null
          recipient_role?: string
          sender_id?: string | null
          sender_label?: string | null
          sender_role?: string
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "incident_messages_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          direction: string
          event_type: string
          id: string
          incident_id: string | null
          last_error: string | null
          payload: Json
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          event_type: string
          id?: string
          incident_id?: string | null
          last_error?: string | null
          payload?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          event_type?: string
          id?: string
          incident_id?: string | null
          last_error?: string | null
          payload?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          latitude: number
          longitude: number
          sharing: boolean
          speed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          latitude: number
          longitude: number
          sharing?: boolean
          speed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          latitude?: number
          longitude?: number
          sharing?: boolean
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      navigate360_incidents: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          incident_id: string
          last_error: string | null
          last_synced_at: string | null
          sync_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          incident_id: string
          last_error?: string | null
          last_synced_at?: string | null
          sync_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          incident_id?: string
          last_error?: string | null
          last_synced_at?: string | null
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigate360_incidents_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          alert_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergies: string | null
          blood_type: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          gender: string | null
          id: string
          medical_conditions: string | null
          medical_notes: string | null
          medications: string | null
          phone: string | null
          special_needs: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          medical_conditions?: string | null
          medical_notes?: string | null
          medications?: string | null
          phone?: string | null
          special_needs?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          medical_conditions?: string | null
          medical_notes?: string | null
          medications?: string | null
          phone?: string | null
          special_needs?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_handover: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          notes: string | null
          received_by: string
          referral_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          received_by: string
          referral_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          received_by?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_handover_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          referral_id: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          referral_id: string
          status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          referral_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_status_history_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          accepted_at: string | null
          ambulance_type: string | null
          arrived_at: string | null
          clinical_notes: string | null
          completed_at: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          crew: string | null
          decision_note: string | null
          departed_at: string | null
          driver_name: string | null
          driver_phone: string | null
          eta_minutes: number | null
          from_facility_id: string
          id: string
          patient_condition: string | null
          patient_ref: string
          priority: string
          provider: string | null
          reference: string
          referring_doctor: string | null
          route_polyline: string | null
          status: string
          to_facility_id: string
          total_distance_km: number | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          ambulance_type?: string | null
          arrived_at?: string | null
          clinical_notes?: string | null
          completed_at?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          crew?: string | null
          decision_note?: string | null
          departed_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          eta_minutes?: number | null
          from_facility_id: string
          id?: string
          patient_condition?: string | null
          patient_ref: string
          priority?: string
          provider?: string | null
          reference?: string
          referring_doctor?: string | null
          route_polyline?: string | null
          status?: string
          to_facility_id: string
          total_distance_km?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          ambulance_type?: string | null
          arrived_at?: string | null
          clinical_notes?: string | null
          completed_at?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          crew?: string | null
          decision_note?: string | null
          departed_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          eta_minutes?: number | null
          from_facility_id?: string
          id?: string
          patient_condition?: string | null
          patient_ref?: string
          priority?: string
          provider?: string | null
          reference?: string
          referring_doctor?: string | null
          route_polyline?: string | null
          status?: string
          to_facility_id?: string
          total_distance_km?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_from_facility_id_fkey"
            columns: ["from_facility_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_to_facility_id_fkey"
            columns: ["to_facility_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "responder_units"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          heading: number | null
          id: string
          incident_id: string | null
          latitude: number
          longitude: number
          recorded_at: string
          responder_id: string | null
          speed: number | null
          status: string | null
          unit_id: string | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          incident_id?: string | null
          latitude: number
          longitude: number
          recorded_at?: string
          responder_id?: string | null
          speed?: number | null
          status?: string | null
          unit_id?: string | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          incident_id?: string | null
          latitude?: number
          longitude?: number
          recorded_at?: string
          responder_id?: string | null
          speed?: number | null
          status?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responder_locations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responder_locations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "responder_units"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_profiles: {
        Row: {
          assigned_unit_id: string | null
          availability: string
          certification_level: string
          created_at: string
          date_of_birth: string | null
          department: string | null
          email: string | null
          employee_number: string | null
          full_name: string | null
          gender: string | null
          home_station: string | null
          id: string
          license_expiry: string | null
          license_number: string | null
          national_id: string | null
          organization: string | null
          phone: string | null
          photo_url: string | null
          rank: string | null
          responder_code: string | null
          updated_at: string
          user_id: string
          years_of_service: number
        }
        Insert: {
          assigned_unit_id?: string | null
          availability?: string
          certification_level?: string
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          employee_number?: string | null
          full_name?: string | null
          gender?: string | null
          home_station?: string | null
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          national_id?: string | null
          organization?: string | null
          phone?: string | null
          photo_url?: string | null
          rank?: string | null
          responder_code?: string | null
          updated_at?: string
          user_id: string
          years_of_service?: number
        }
        Update: {
          assigned_unit_id?: string | null
          availability?: string
          certification_level?: string
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          employee_number?: string | null
          full_name?: string | null
          gender?: string | null
          home_station?: string | null
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          national_id?: string | null
          organization?: string | null
          phone?: string | null
          photo_url?: string | null
          rank?: string | null
          responder_code?: string | null
          updated_at?: string
          user_id?: string
          years_of_service?: number
        }
        Relationships: [
          {
            foreignKeyName: "responder_profiles_assigned_unit_id_fkey"
            columns: ["assigned_unit_id"]
            isOneToOne: false
            referencedRelation: "responder_units"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_units: {
        Row: {
          accuracy: number | null
          call_sign: string
          created_at: string
          current_alert_id: string | null
          equipment_status: string
          eta_minutes: number | null
          fuel_level: number
          heading: number | null
          id: string
          image_url: string | null
          kind: string
          last_inspection: string | null
          last_location_update: string | null
          latitude: number | null
          longitude: number | null
          mileage_km: number
          name: string
          phone: string | null
          registration_number: string | null
          speed: number | null
          status: string
          updated_at: string
          user_id: string | null
          vehicle: string | null
          vehicle_number: string | null
        }
        Insert: {
          accuracy?: number | null
          call_sign: string
          created_at?: string
          current_alert_id?: string | null
          equipment_status?: string
          eta_minutes?: number | null
          fuel_level?: number
          heading?: number | null
          id?: string
          image_url?: string | null
          kind?: string
          last_inspection?: string | null
          last_location_update?: string | null
          latitude?: number | null
          longitude?: number | null
          mileage_km?: number
          name: string
          phone?: string | null
          registration_number?: string | null
          speed?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          vehicle_number?: string | null
        }
        Update: {
          accuracy?: number | null
          call_sign?: string
          created_at?: string
          current_alert_id?: string | null
          equipment_status?: string
          eta_minutes?: number | null
          fuel_level?: number
          heading?: number | null
          id?: string
          image_url?: string | null
          kind?: string
          last_inspection?: string | null
          last_location_update?: string | null
          latitude?: number | null
          longitude?: number | null
          mileage_km?: number
          name?: string
          phone?: string | null
          registration_number?: string | null
          speed?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responder_units_current_alert_id_fkey"
            columns: ["current_alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          note: string | null
          shift_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          shift_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          shift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          break_seconds: number
          break_started_at: string | null
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          started_at: string
          status: string
          unit_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          break_seconds?: number
          break_started_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          break_seconds?: number
          break_started_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "responder_units"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_assign_responder_vehicle: {
        Args: { _email: string; _unit_id?: string; _user_id: string }
        Returns: Json
      }
      can_access_incident: { Args: { _alert_id: string }; Returns: boolean }
      create_care_link: {
        Args: { _as_patient: boolean; _email: string; _relationship?: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      incident_response_view: {
        Args: { _alert_id: string }
        Returns: {
          accuracy: number
          call_sign: string
          eta_minutes: number
          heading: number
          incident_lat: number
          incident_lng: number
          incident_status: string
          kind: string
          last_location_update: string
          latitude: number
          longitude: number
          speed: number
          unit_id: string
          unit_status: string
        }[]
      }
      is_carer_of: { Args: { _patient: string }; Returns: boolean }
      lookup_profile_by_email: {
        Args: { _email: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      submit_sos_alert: {
        Args: {
          _latitude: number
          _longitude: number
          _accuracy?: number | null
          _heading?: number | null
          _speed?: number | null
          _patient_name?: string | null
          _patient_phone?: string | null
          _message?: string | null
        }
        Returns: { id: string; status: string }[]
      }
      upsert_live_location: {
        Args: {
          _accuracy?: number
          _heading?: number
          _lat: number
          _lng: number
          _sharing?: boolean
          _speed?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "patient"
        | "responder"
        | "admin"
        | "crew"
        | "hospital"
        | "operator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "patient",
        "responder",
        "admin",
        "crew",
        "hospital",
        "operator",
      ],
    },
  },
} as const
