import requests
import unittest
import os
import json
from datetime import datetime

class BackendAPITest(unittest.TestCase):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Get the backend URL from the frontend .env file
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    self.base_url = line.strip().split('=')[1]
                    break
        
        print(f"Using backend URL: {self.base_url}")
        
    def test_01_root_endpoint(self):
        """Test the root endpoint"""
        print("\n🔍 Testing root endpoint...")
        url = f"{self.base_url}/api/"
        
        try:
            response = requests.get(url)
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["message"], "Hello World")
            print("✅ Root endpoint test passed")
        except Exception as e:
            self.fail(f"❌ Root endpoint test failed: {str(e)}")
    
    def test_02_create_status_check(self):
        """Test creating a status check"""
        print("\n🔍 Testing status check creation...")
        url = f"{self.base_url}/api/status"
        client_name = f"test_client_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        data = {"client_name": client_name}
        
        try:
            response = requests.post(url, json=data)
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["client_name"], client_name)
            self.assertIn("id", result)
            self.assertIn("timestamp", result)
            print("✅ Status check creation test passed")
            return result["id"]  # Return ID for next test
        except Exception as e:
            self.fail(f"❌ Status check creation test failed: {str(e)}")
    
    def test_03_get_status_checks(self):
        """Test getting status checks"""
        print("\n🔍 Testing get status checks...")
        url = f"{self.base_url}/api/status"
        
        try:
            response = requests.get(url)
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertIsInstance(result, list)
            print(f"✅ Get status checks test passed - Found {len(result)} status checks")
        except Exception as e:
            self.fail(f"❌ Get status checks test failed: {str(e)}")

if __name__ == "__main__":
    unittest.main()