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
        self.test_status_id = None
        
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
            self.test_status_id = result["id"]
            print(f"✅ Status check creation test passed - Created ID: {self.test_status_id}")
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
            
            # Verify our created status check is in the list
            if self.test_status_id:
                found = False
                for status in result:
                    if status.get("id") == self.test_status_id:
                        found = True
                        break
                self.assertTrue(found, f"Created status check with ID {self.test_status_id} not found in results")
                print(f"✅ Successfully verified created status check in results")
            
            print(f"✅ Get status checks test passed - Found {len(result)} status checks")
        except Exception as e:
            self.fail(f"❌ Get status checks test failed: {str(e)}")
    
    def test_04_api_error_handling(self):
        """Test API error handling with invalid data"""
        print("\n🔍 Testing API error handling...")
        url = f"{self.base_url}/api/status"
        
        # Test with missing required field
        try:
            response = requests.post(url, json={})
            # Should return 422 Unprocessable Entity for validation error
            self.assertIn(response.status_code, [400, 422], 
                          f"Expected 400 or 422 status code for invalid data, got {response.status_code}")
            print("✅ API correctly rejected request with missing required field")
        except Exception as e:
            self.fail(f"❌ API error handling test failed: {str(e)}")

def run_tests():
    """Run the tests and return results"""
    suite = unittest.TestLoader().loadTestsFromTestCase(BackendAPITest)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)