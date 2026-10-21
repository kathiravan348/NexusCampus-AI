// Client SDK for consuming Mock Platform data

import { BaseModuleData, StudentRecord, StaffRecord, CourseRecord, FeeInvoiceRecord } from './types';
import { getModuleMockData, MODULE_MOCK_REGISTRY } from './registry';
import { MOCK_STUDENTS, MOCK_STAFF, MOCK_COURSES, MOCK_INVOICES } from './relational';

export class MockPlatformClient {
  /**
   * Retrieve module payload by ID (M01..M64)
   */
  public getModule(moduleId: string): BaseModuleData {
    return getModuleMockData(moduleId);
  }

  /**
   * Retrieve all modules registry
   */
  public getAllModules(): Record<string, BaseModuleData> {
    return MODULE_MOCK_REGISTRY;
  }

  /**
   * Retrieve students
   */
  public getStudents(): StudentRecord[] {
    return MOCK_STUDENTS;
  }

  /**
   * Retrieve staff
   */
  public getStaff(): StaffRecord[] {
    return MOCK_STAFF;
  }

  /**
   * Retrieve courses
   */
  public getCourses(): CourseRecord[] {
    return MOCK_COURSES;
  }

  /**
   * Retrieve invoices
   */
  public getInvoices(): FeeInvoiceRecord[] {
    return MOCK_INVOICES;
  }

  /**
   * Asynchronous simulated API call with latency
   */
  public async fetchModuleAsync(moduleId: string, delayMs: number = 100): Promise<BaseModuleData> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.getModule(moduleId));
      }, delayMs);
    });
  }
}

export const mockClient = new MockPlatformClient();
