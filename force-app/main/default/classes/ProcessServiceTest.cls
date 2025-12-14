/**
 * @description Test class for ProcessService
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Test
 * 
 * EXPLANATION:
 * Comprehensive test coverage for ProcessService including:
 * - Positive scenarios (happy path)
 * - Negative scenarios (error handling)
 * - Bulk scenarios (200+ records)
 * - Edge cases
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core test coverage
 */
@IsTest
private class ProcessServiceTest {
    
    // =========================================================================
    // TEST DATA SETUP
    // =========================================================================
    
    @TestSetup
    static void setupTestData() {
        // Create test category
        Process_Category__c category = new Process_Category__c(
            Name = 'Test Category',
            Description__c = 'Category for unit tests',
            Is_Active__c = true,
            Sort_Order__c = 1
        );
        insert category;
        
        // Create test process
        Process__c process = new Process__c(
            Name = 'Test Process',
            Description__c = 'Process for unit tests',
            Status__c = 'Draft',
            Current_Version__c = 1,
            Category__c = category.Id,
            Canvas_JSON__c = getTestCanvasJson()
        );
        insert process;
        
        // Create test elements
        List<BPMN_Element__c> elements = new List<BPMN_Element__c>();
        elements.add(new BPMN_Element__c(
            Process__c = process.Id,
            Name = 'Start',
            Element_Id__c = 'elem_start_001',
            Element_Type__c = 'StartEvent',
            Position_X__c = 100,
            Position_Y__c = 200,
            Width__c = 50,
            Height__c = 50,
            Sort_Order__c = 1
        ));
        elements.add(new BPMN_Element__c(
            Process__c = process.Id,
            Name = 'Review Task',
            Element_Id__c = 'elem_task_001',
            Element_Type__c = 'UserTask',
            Position_X__c = 250,
            Position_Y__c = 200,
            Width__c = 120,
            Height__c = 60,
            Assigned_Role__c = 'Manager',
            Duration_Hours__c = 2,
            Sort_Order__c = 2
        ));
        elements.add(new BPMN_Element__c(
            Process__c = process.Id,
            Name = 'End',
            Element_Id__c = 'elem_end_001',
            Element_Type__c = 'EndEvent',
            Position_X__c = 450,
            Position_Y__c = 200,
            Width__c = 50,
            Height__c = 50,
            Sort_Order__c = 3
        ));
        insert elements;
        
        // Create test connections
        List<BPMN_Connection__c> connections = new List<BPMN_Connection__c>();
        connections.add(new BPMN_Connection__c(
            Process__c = process.Id,
            Connection_Id__c = 'conn_001',
            Connection_Type__c = 'SequenceFlow',
            Source_Element__c = elements[0].Id,
            Target_Element__c = elements[1].Id
        ));
        connections.add(new BPMN_Connection__c(
            Process__c = process.Id,
            Connection_Id__c = 'conn_002',
            Connection_Type__c = 'SequenceFlow',
            Source_Element__c = elements[1].Id,
            Target_Element__c = elements[2].Id
        ));
        insert connections;
    }
    
    static String getTestCanvasJson() {
        return '{"elements":[' +
            '{"id":"elem_start_001","name":"Start","type":"StartEvent","x":100,"y":200,"width":50,"height":50},' +
            '{"id":"elem_task_001","name":"Review Task","type":"UserTask","x":250,"y":200,"width":120,"height":60,"assignedRole":"Manager","durationHours":2},' +
            '{"id":"elem_end_001","name":"End","type":"EndEvent","x":450,"y":200,"width":50,"height":50}' +
            '],"connections":[' +
            '{"id":"conn_001","type":"SequenceFlow","sourceId":"elem_start_001","targetId":"elem_task_001"},' +
            '{"id":"conn_002","type":"SequenceFlow","sourceId":"elem_task_001","targetId":"elem_end_001"}' +
            '],"viewBox":{"x":0,"y":0,"width":1000,"height":800},"zoom":1.0}';
    }
    
    // =========================================================================
    // CREATE PROCESS TESTS
    // =========================================================================
    
    @IsTest
    static void testCreateProcess_Success() {
        Test.startTest();
        
        Id processId = ProcessService.createProcess(
            'New Test Process',
            'Description for new process',
            null,
            null
        );
        
        Test.stopTest();
        
        System.assertNotEquals(null, processId, 'Process ID should be returned');
        
        Process__c created = [SELECT Name, Description__c, Status__c, Current_Version__c 
                              FROM Process__c WHERE Id = :processId];
        System.assertEquals('New Test Process', created.Name, 'Name should match');
        System.assertEquals('Draft', created.Status__c, 'Status should be Draft');
        System.assertEquals(1, created.Current_Version__c, 'Version should be 1');
    }
    
    @IsTest
    static void testCreateProcess_WithCanvas() {
        Test.startTest();
        
        Id processId = ProcessService.createProcess(
            'Process With Canvas',
            'Has initial canvas',
            null,
            getTestCanvasJson()
        );
        
        Test.stopTest();
        
        Process__c created = [SELECT Canvas_JSON__c FROM Process__c WHERE Id = :processId];
        System.assertNotEquals(null, created.Canvas_JSON__c, 'Canvas JSON should be set');
        
        // Verify elements were created
        List<BPMN_Element__c> elements = [SELECT Id FROM BPMN_Element__c WHERE Process__c = :processId];
        System.assertEquals(3, elements.size(), 'Should have 3 elements');
    }
    
    @IsTest
    static void testCreateProcess_BlankName() {
        Test.startTest();
        
        try {
            ProcessService.createProcess('', 'Description', null, null);
            System.assert(false, 'Should have thrown exception');
        } catch (ProcessService.ProcessException e) {
            System.assert(e.getMessage().contains('name is required'), 'Should indicate name required');
        }
        
        Test.stopTest();
    }
    
    // =========================================================================
    // LOAD PROCESS TESTS
    // =========================================================================
    
    @IsTest
    static void testLoadProcess_Success() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        Test.startTest();
        
        ProcessService.ProcessData data = ProcessService.loadProcess(proc.Id);
        
        Test.stopTest();
        
        System.assertNotEquals(null, data, 'Data should be returned');
        System.assertEquals('Test Process', data.name, 'Name should match');
        System.assertEquals('Draft', data.status, 'Status should match');
        System.assertEquals(true, data.isEditable, 'Should be editable');
        System.assertNotEquals(null, data.canvasJson, 'Canvas JSON should be present');
    }
    
    @IsTest
    static void testLoadProcess_NullId() {
        Test.startTest();
        
        try {
            ProcessService.loadProcess(null);
            System.assert(false, 'Should have thrown exception');
        } catch (ProcessService.ProcessException e) {
            System.assert(e.getMessage().contains('ID is required'), 'Should indicate ID required');
        }
        
        Test.stopTest();
    }
    
    @IsTest
    static void testLoadProcess_NotFound() {
        Test.startTest();
        
        try {
            // Use a valid ID format but non-existent record
            Id fakeId = Process__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
            ProcessService.loadProcess(fakeId);
            System.assert(false, 'Should have thrown exception');
        } catch (ProcessService.ProcessException e) {
            System.assert(e.getMessage().contains('not found'), 'Should indicate not found');
        }
        
        Test.stopTest();
    }
    
    // =========================================================================
    // SAVE PROCESS TESTS
    // =========================================================================
    
    @IsTest
    static void testSaveProcess_Success() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        // Modified canvas with new element
        String newCanvas = '{"elements":[' +
            '{"id":"elem_start_001","name":"Start","type":"StartEvent","x":100,"y":200,"width":50,"height":50},' +
            '{"id":"elem_task_001","name":"Updated Task","type":"UserTask","x":250,"y":200,"width":120,"height":60},' +
            '{"id":"elem_task_002","name":"New Task","type":"ServiceTask","x":400,"y":200,"width":120,"height":60},' +
            '{"id":"elem_end_001","name":"End","type":"EndEvent","x":550,"y":200,"width":50,"height":50}' +
            '],"connections":[],"viewBox":{"x":0,"y":0},"zoom":1.0}';
        
        Test.startTest();
        
        ProcessService.SaveResult result = ProcessService.saveProcess(proc.Id, newCanvas, '{"x":50,"y":50}');
        
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Save should succeed');
        System.assertEquals(1, result.elementsCreated, 'Should create 1 element');
        System.assertEquals(3, result.elementsUpdated, 'Should update 3 elements');
        
        // Verify canvas was saved
        Process__c updated = [SELECT Canvas_JSON__c, ViewBox_Settings__c FROM Process__c WHERE Id = :proc.Id];
        System.assert(updated.Canvas_JSON__c.contains('Updated Task'), 'Canvas should be updated');
        System.assertNotEquals(null, updated.ViewBox_Settings__c, 'ViewBox should be saved');
    }
    
    @IsTest
    static void testSaveProcess_PublishedProcess() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        proc.Status__c = 'Published';
        update proc;
        
        Test.startTest();
        
        ProcessService.SaveResult result = ProcessService.saveProcess(proc.Id, '{}', null);
        
        Test.stopTest();
        
        System.assertEquals(false, result.success, 'Save should fail');
        System.assert(result.message.contains('Published'), 'Should mention Published status');
    }
    
    // =========================================================================
    // PUBLISH TESTS
    // =========================================================================
    
    @IsTest
    static void testPublishProcess_Success() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        Test.startTest();
        
        Id versionId = ProcessService.publishProcess(proc.Id, 'Initial release');
        
        Test.stopTest();
        
        System.assertNotEquals(null, versionId, 'Version ID should be returned');
        
        // Verify version record
        Process_Version__c version = [SELECT Version_Number__c, Change_Notes__c, Canvas_Snapshot__c 
                                      FROM Process_Version__c WHERE Id = :versionId];
        System.assertEquals(2, version.Version_Number__c, 'Should be version 2');
        System.assertEquals('Initial release', version.Change_Notes__c, 'Notes should match');
        System.assertNotEquals(null, version.Canvas_Snapshot__c, 'Snapshot should be saved');
        
        // Verify process status updated
        Process__c updated = [SELECT Status__c, Current_Version__c, Last_Published_Date__c 
                              FROM Process__c WHERE Id = :proc.Id];
        System.assertEquals('Published', updated.Status__c, 'Status should be Published');
        System.assertEquals(2, updated.Current_Version__c, 'Version should be 2');
        System.assertNotEquals(null, updated.Last_Published_Date__c, 'Publish date should be set');
    }
    
    @IsTest
    static void testPublishProcess_NoStartEvent() {
        // Create process without start event
        Process__c proc = new Process__c(
            Name = 'No Start Event',
            Status__c = 'Draft',
            Canvas_JSON__c = '{"elements":[{"id":"task1","name":"Task","type":"UserTask","x":100,"y":100}],"connections":[]}'
        );
        insert proc;
        
        // Create just a task (no start event)
        BPMN_Element__c task = new BPMN_Element__c(
            Process__c = proc.Id,
            Name = 'Task',
            Element_Id__c = 'task1',
            Element_Type__c = 'UserTask'
        );
        insert task;
        
        Test.startTest();
        
        try {
            ProcessService.publishProcess(proc.Id, 'Test');
            System.assert(false, 'Should have thrown exception');
        } catch (ProcessService.ProcessException e) {
            System.assert(e.getMessage().contains('Start Event'), 'Should mention Start Event');
        }
        
        Test.stopTest();
    }
    
    // =========================================================================
    // VALIDATION TESTS
    // =========================================================================
    
    @IsTest
    static void testValidateForPublish_Valid() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        Test.startTest();
        
        ProcessService.ValidationResult result = ProcessService.validateProcessForPublish(proc.Id);
        
        Test.stopTest();
        
        System.assertEquals(true, result.isValid, 'Should be valid');
        System.assertEquals(0, result.errors.size(), 'Should have no errors');
    }
    
    @IsTest
    static void testValidateForPublish_EmptyCanvas() {
        Process__c proc = new Process__c(
            Name = 'Empty Process',
            Status__c = 'Draft',
            Canvas_JSON__c = ''
        );
        insert proc;
        
        Test.startTest();
        
        ProcessService.ValidationResult result = ProcessService.validateProcessForPublish(proc.Id);
        
        Test.stopTest();
        
        System.assertEquals(false, result.isValid, 'Should be invalid');
        System.assert(result.errors.size() > 0, 'Should have errors');
    }
    
    // =========================================================================
    // CLONE TESTS
    // =========================================================================
    
    @IsTest
    static void testCloneProcess_Success() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        Test.startTest();
        
        Id clonedId = ProcessService.cloneProcess(proc.Id, 'Cloned Process');
        
        Test.stopTest();
        
        System.assertNotEquals(null, clonedId, 'Cloned ID should be returned');
        System.assertNotEquals(proc.Id, clonedId, 'Should be different ID');
        
        // Verify cloned process
        Process__c cloned = [SELECT Name, Status__c, Current_Version__c FROM Process__c WHERE Id = :clonedId];
        System.assertEquals('Cloned Process', cloned.Name, 'Name should match');
        System.assertEquals('Draft', cloned.Status__c, 'Status should be Draft');
        System.assertEquals(1, cloned.Current_Version__c, 'Version should be 1');
        
        // Verify elements were cloned
        List<BPMN_Element__c> clonedElements = [SELECT Id FROM BPMN_Element__c WHERE Process__c = :clonedId];
        System.assertEquals(3, clonedElements.size(), 'Should have 3 cloned elements');
        
        // Verify connections were cloned
        List<BPMN_Connection__c> clonedConnections = [SELECT Id FROM BPMN_Connection__c WHERE Process__c = :clonedId];
        System.assertEquals(2, clonedConnections.size(), 'Should have 2 cloned connections');
    }
    
    // =========================================================================
    // DELETE TESTS
    // =========================================================================
    
    @IsTest
    static void testDeleteProcess_Success() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        Id procId = proc.Id;
        
        Test.startTest();
        
        ProcessService.deleteProcess(procId);
        
        Test.stopTest();
        
        // Verify deleted
        List<Process__c> remaining = [SELECT Id FROM Process__c WHERE Id = :procId];
        System.assertEquals(0, remaining.size(), 'Process should be deleted');
        
        // Verify children deleted (cascade)
        List<BPMN_Element__c> elements = [SELECT Id FROM BPMN_Element__c WHERE Process__c = :procId];
        System.assertEquals(0, elements.size(), 'Elements should be deleted');
    }
    
    @IsTest
    static void testDeleteProcess_Published() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        proc.Status__c = 'Published';
        update proc;
        
        Test.startTest();
        
        try {
            ProcessService.deleteProcess(proc.Id);
            System.assert(false, 'Should have thrown exception');
        } catch (ProcessService.ProcessException e) {
            System.assert(e.getMessage().contains('Published'), 'Should mention Published');
        }
        
        Test.stopTest();
    }
    
    // =========================================================================
    // BULK TESTS
    // =========================================================================
    
    @IsTest
    static void testBulkElementSync() {
        Process__c proc = [SELECT Id FROM Process__c LIMIT 1];
        
        // Create canvas with 200 elements
        List<String> elementJsons = new List<String>();
        for (Integer i = 0; i < 200; i++) {
            elementJsons.add('{"id":"bulk_elem_' + i + '","name":"Element ' + i + '","type":"UserTask","x":' + (100 + i * 10) + ',"y":200,"width":100,"height":60}');
        }
        
        String bulkCanvas = '{"elements":[' + String.join(elementJsons, ',') + '],"connections":[],"viewBox":{},"zoom":1}';
        
        Test.startTest();
        
        ProcessService.SaveResult result = ProcessService.saveProcess(proc.Id, bulkCanvas, null);
        
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Bulk save should succeed');
        System.assertEquals(200, result.elementsCreated, 'Should create 200 elements');
        
        // Verify elements exist
        Integer count = [SELECT COUNT() FROM BPMN_Element__c WHERE Process__c = :proc.Id];
        System.assertEquals(200, count, 'Should have 200 elements total');
    }
}
