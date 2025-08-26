#!/usr/bin/env python3
"""Simple script to create a new OpenHands conversation with custom message + common tail."""

import os
import sys
import time
from pathlib import Path

import requests


def create_conversation_with_message(custom_message: str, repository: str = "All-Hands-AI/OpenHands"):
    """Create a new conversation with custom message + common tail.
    
    Args:
        custom_message: Your custom message to send
        repository: Repository to work with (default: All-Hands-AI/OpenHands)
    """
    # Get API key from environment
    api_key = os.getenv('OPENHANDS_API_KEY')
    if not api_key:
        print("❌ Error: OPENHANDS_API_KEY environment variable is required")
        sys.exit(1)
    
    # Read common tail content
    script_dir = Path(__file__).parent
    common_tail_path = script_dir / "scripts" / "prompts" / "common_tail.j2"
    
    if not common_tail_path.exists():
        print(f"❌ Error: Common tail file not found at {common_tail_path}")
        sys.exit(1)
    
    common_tail = common_tail_path.read_text().strip()
    
    # Combine custom message with common tail
    full_message = f"{custom_message}\n\n{common_tail}"
    
    # Prepare API request
    base_url = "https://app.all-hands.dev"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "initial_user_msg": full_message,
        "repository": repository
    }
    
    print(f"Creating conversation for repository: {repository}")
    print(f"Message preview: {custom_message[:100]}...")
    print(f"Full message length: {len(full_message)} characters")
    
    # Send request
    try:
        response = requests.post(f"{base_url}/api/conversations", headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        conversation_id = result.get('conversation_id')
        status = result.get('status', 'unknown')
        
        print("✅ Conversation created successfully!")
        print(f"   Conversation ID: {conversation_id}")
        print(f"   Status: {status}")
        print(f"   Link: {base_url}/conversations/{conversation_id}")
        
        # Multiple polling attempts to get LLM info from events
        llm_model = None
        polling_intervals = [5, 10, 30]  # seconds
        
        for i, interval in enumerate(polling_intervals, 1):
            print(f"\n⏳ Polling attempt {i}/{len(polling_intervals)} - waiting {interval} seconds...")
            time.sleep(interval)
            
            # Get conversation details
            try:
                details_response = requests.get(f"{base_url}/api/conversations/{conversation_id}", headers=headers)
                details_response.raise_for_status()
                details = details_response.json()
                
                print(f"📋 Conversation Status: {details.get('status', 'N/A')}")
                
                # Try to get recent events to find LLM model
                try:
                    events_response = requests.get(
                        f"{base_url}/api/conversations/{conversation_id}/events",
                        headers=headers,
                        params={"reverse": "true", "limit": "10"}  # Get latest 10 events
                    )
                    events_response.raise_for_status()
                    events_data = events_response.json()
                    events = events_data.get("events", [])
                    
                    print(f"   Found {len(events)} recent events")
                    
                    # Look for LLM model in events
                    for event in events:
                        if event.get("source") == "agent" and "tool_call_metadata" in event:
                            metadata = event["tool_call_metadata"]
                            if "model_response" in metadata:
                                model_info = metadata["model_response"]
                                if "model" in model_info:
                                    llm_model = model_info["model"]
                                    print(f"   🤖 LLM Model: {llm_model}")
                                    break
                    
                    if llm_model:
                        break  # Found LLM, no need to continue polling
                        
                except requests.exceptions.RequestException as e:
                    print(f"   ⚠️  Could not fetch events: {e}")
                    
            except requests.exceptions.RequestException as e:
                print(f"   ⚠️  Could not fetch conversation details: {e}")
        
        # Final summary
        print(f"\n📋 Final Conversation Details:")
        try:
            details_response = requests.get(f"{base_url}/api/conversations/{conversation_id}", headers=headers)
            details_response.raise_for_status()
            details = details_response.json()
            
            print(f"   Title: {details.get('title', 'N/A')}")
            print(f"   Status: {details.get('status', 'N/A')}")
            print(f"   LLM Model: {llm_model or 'Not detected yet'}")
            print(f"   Created At: {details.get('created_at', 'N/A')}")
            print(f"   Repository: {details.get('repository', 'N/A')}")
            
            # Print runtime details if available
            if 'url' in details:
                print(f"   Runtime URL: {details['url']}")
            if 'session_api_key' in details and details['session_api_key']:
                print(f"   Session API Key: {details['session_api_key'][:20]}...")
                
        except requests.exceptions.RequestException as e:
            print(f"⚠️  Warning: Could not fetch final conversation details: {e}")
        
        return conversation_id
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error creating conversation: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python create_conversation.py 'Your custom message here'")
        print("Example: python create_conversation.py 'Please help me fix the failing tests in the CI'")
        sys.exit(1)
    
    custom_message = sys.argv[1]
    create_conversation_with_message(custom_message)